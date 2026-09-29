/**
 * OPT-799 — action-level optional ("Then, you may…") through the real action
 * pipeline with the registered authored schemas.
 *
 * Card text (docs/cards/):
 * - OP14-079 Crocodile: "[Activate: Main] [Once Per Turn] You may K.O. 1 of
 *   your Characters with a type including "Baroque Works": Give up to 1 of
 *   your opponent's Characters −10 cost during this turn. Then, you may trash
 *   2 cards from the top of your deck."
 * - EB04-001 Jewelry Bonney: "[Activate: Main] [Once Per Turn] Give up to 1 of
 *   your opponent's Characters −1000 power during this turn. Then, if you have
 *   2 or more Life cards, you may add 1 card from the top of your Life cards
 *   to your hand."
 * - P-036 Monkey.D.Luffy: "[When Attacking] You may add 1 card from the top or
 *   bottom of your Life cards to your hand: This Character and up to 1 of your
 *   Leader gain +1000 power during this turn."
 *
 * Rules: 4-8-1 ("up to X" chooses 0..X), 4-10-1 (a failed "if" clause stops
 * its dependent), 4-10-2 (a failed "then" clause does not stop the next).
 */
import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { Action, EffectBlock, EffectSchema, Target } from "../engine/effect-types.js";
import { targetPromptCountMin } from "../engine/effect-resolver/target-resolver.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { optionalClauseDescription } from "../engine/effect-resolver/action-utils.js";
import { getEffectiveCost, getEffectivePower } from "../engine/modifiers.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const TEXT = {
  "OP14-079":
    "All of your opponent's Characters cannot be removed from the field by your effects.<br>[Activate: Main] [Once Per Turn] You may K.O. 1 of your Characters with a type including \"Baroque Works\": Give up to 1 of your opponent's Characters −10 cost during this turn. Then, you may trash 2 cards from the top of your deck.",
  "EB04-001":
    "[Opponent's Turn] If you have 1 or less Life cards, this Leader gains +2000 power.<br>[Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters −1000 power during this turn. Then, if you have 2 or more Life cards, you may add 1 card from the top of your Life cards to your hand.",
  "P-036":
    "[When Attacking] You may add 1 card from the top or bottom of your Life cards to your hand: This Character and up to 1 of your Leader gain +1000 power during this turn.",
} as const;

function fixture() {
  const db = createTestCardDb();
  let state: GameState = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1,
    zone: CardInstance["zone"],
    data: Partial<CardData> = {}
  ): CardInstance {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
      id,
      name: schema?.card_name ?? id,
      effectText: TEXT[id as keyof typeof TEXT] ?? "",
      effectSchema: schema ?? null,
      ...data,
    });
    const card: CardInstance = {
      instanceId: `${id}-${owner}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[owner];
    if (zone === "LEADER") p.leader = card;
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  /** Respond to the pending prompt; returns whether it was rejected. */
  function respond(action: GameAction): boolean {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    state = result.state;
    return result.responseRejected;
  }
  const accept = () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => respond({ type: "PASS" });
  const select = (ids: string[]) =>
    respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  function prompt() {
    return state.pendingPrompt;
  }
  function promptType() {
    return state.pendingPrompt?.options.promptType;
  }
  function optionalPrompt() {
    const p = state.pendingPrompt;
    expect(p?.options.promptType).toBe("OPTIONAL_EFFECT");
    if (p?.options.promptType !== "OPTIONAL_EFFECT")
      throw new Error(JSON.stringify(p?.options));
    return { options: p.options, respondingPlayer: p.respondingPlayer };
  }
  return {
    db,
    put,
    act,
    respond,
    accept,
    decline,
    select,
    prompt,
    promptType,
    optionalPrompt,
    persist() {
      state = parseStoredSession(
        JSON.parse(
          JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })
        )
      ).state;
    },
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function trashFromDeckCount(f: Fixture, owner: 0 | 1, from: number): number {
  return f.state.eventLog
    .slice(from)
    .filter(
      (e) =>
        e.type === "CARD_TRASHED" &&
        e.playerIndex === owner &&
        (e.payload as { from?: string } | undefined)?.from === "DECK"
    ).length;
}

// ─── OP14-079 Crocodile ──────────────────────────────────────────────────────

describe("OPT-799 OP14-079 Crocodile — Then, you may trash 2 from deck", () => {
  function reachMillPrompt() {
    const f = fixture();
    const leader = f.put("OP14-079", 0, "LEADER");
    const baroque = f.put("OPT799-BW", 0, "CHARACTER", {
      types: ["Baroque Works"],
    });
    const victim = f.put("OPT799-OPP", 1, "CHARACTER", { cost: 5 });
    const deckBefore = f.state.players[0].deck.length;
    const logStart = f.state.eventLog.length;
    const promptTrail: string[] = [];

    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: leader.instanceId,
      effectId: "OP14-079_activate",
    });
    // Block-level "You may K.O. …:" (the optional cost) asks first.
    promptTrail.push(String(f.promptType()));
    expect(f.optionalPrompt().options.effectDescription).toContain(
      "You may K.O. 1 of your Characters"
    );
    expect(f.accept()).toBe(false);
    // K.O. cost: pick the Baroque Works Character when asked.
    if (f.promptType() === "SELECT_TARGET") {
      promptTrail.push("SELECT_TARGET(cost)");
      expect(f.select([baroque.instanceId])).toBe(false);
    }
    expect(f.state.players[0].trash.map((c) => c.cardId)).toContain(
      "OPT799-BW"
    );
    // "Give up to 1 of your opponent's Characters −10 cost".
    promptTrail.push(`${f.promptType()}(target)`);
    expect(f.select([victim.instanceId])).toBe(false);
    return { f, leader, victim, deckBefore, logStart, promptTrail };
  }

  function victimCost(f: Fixture, victim: CardInstance): number {
    return getEffectiveCost(f.db.get(victim.cardId)!, f.state, victim.instanceId, f.db);
  }

  it("resolves the cost reduction, then asks the controller whether to trash 2", () => {
    const { f, leader, victim, deckBefore, logStart, promptTrail } =
      reachMillPrompt();
    const { options, respondingPlayer } = f.optionalPrompt();
    expect(respondingPlayer).toBe(0);
    expect(options.effectDescription).toBe(
      "Then, you may trash 2 cards from the top of your deck."
    );
    expect(options.cards?.[0]?.instanceId).toBe(leader.instanceId);
    // Earlier clause already applied; the mill has not happened yet.
    expect(victimCost(f, victim)).toBe(0);
    expect(f.state.players[0].deck).toHaveLength(deckBefore);
    expect(trashFromDeckCount(f, 0, logStart)).toBe(0);
    // One block prompt, the cost/target selections, then one clause prompt.
    expect(promptTrail[0]).toBe("OPTIONAL_EFFECT");
    expect(promptTrail.filter((p) => p === "OPTIONAL_EFFECT")).toHaveLength(1);
  });

  it("accept trashes exactly the top 2 cards of the deck", () => {
    const { f, victim, deckBefore } = reachMillPrompt();
    const topTwo = f.state.players[0].deck.slice(0, 2).map((c) => c.cardId);
    const remaining = f.state.players[0].deck.slice(2).map((c) => c.instanceId);
    const trashBefore = new Set(f.state.players[0].trash.map((c) => c.instanceId));
    expect(f.accept()).toBe(false);
    expect(f.prompt()).toBeNull();
    expect(f.state.effectStack).toEqual([]);
    expect(f.state.players[0].deck.map((c) => c.instanceId)).toEqual(remaining);
    expect(
      f.state.players[0].trash
        .filter((c) => !trashBefore.has(c.instanceId))
        .map((c) => c.cardId)
        .sort()
    ).toEqual([...topTwo].sort());
    expect(victimCost(f, victim)).toBe(0);
  });

  it("decline keeps the deck, keeps the −10 cost and still spends Once Per Turn", () => {
    const { f, leader, victim, deckBefore, logStart } = reachMillPrompt();
    expect(f.decline()).toBe(false);
    expect(f.prompt()).toBeNull();
    expect(f.state.effectStack).toEqual([]);
    expect(f.state.players[0].deck).toHaveLength(deckBefore);
    expect(trashFromDeckCount(f, 0, logStart)).toBe(0);
    expect(victimCost(f, victim)).toBe(0);
    // Once Per Turn was used by the activation itself.
    const again = runPipeline(
      f.state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: leader.instanceId,
        effectId: "OP14-079_activate",
      },
      f.db,
      0
    );
    expect(again.valid).toBe(false);
  });

  it("survives persist/resume at the clause prompt without re-applying the cost reduction", () => {
    const { f, victim, deckBefore } = reachMillPrompt();
    const modifiersBefore = f.state.activeEffects.length;
    f.persist();
    expect(f.optionalPrompt().options.effectDescription).toBe(
      "Then, you may trash 2 cards from the top of your deck."
    );
    expect(f.state.effectStack).toHaveLength(1);
    expect(f.accept()).toBe(false);
    expect(f.state.activeEffects).toHaveLength(modifiersBefore);
    expect(victimCost(f, victim)).toBe(0);
    expect(f.state.players[0].deck).toHaveLength(deckBefore - 2);
  });

  it("rejects wrong-player, malformed, and duplicate responses", () => {
    const { f, deckBefore } = reachMillPrompt();
    const coordinator = new SessionCoordinator();
    const acceptAction: GameAction = { type: "PLAYER_CHOICE", choiceId: "accept" };
    expect(coordinator.routePromptResponse(f.state, 1, acceptAction)).toMatchObject({
      kind: "reject",
      reason: "Waiting for opponent to respond to prompt",
    });
    expect(
      coordinator.routePromptResponse(f.state, 0, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [],
      }).kind
    ).toBe("reject");
    expect(
      coordinator.routePromptResponse(f.state, 0, {
        type: "PLAYER_CHOICE",
        choiceId: "bogus",
      }).kind
    ).toBe("reject");
    expect(coordinator.routePromptResponse(f.state, 0, acceptAction).kind).toBe(
      "resume"
    );

    // The engine handler itself also refuses a non-decision, frame intact.
    const before = structuredClone(f.state);
    expect(f.respond({ type: "SELECT_TARGET", selectedInstanceIds: [] })).toBe(true);
    expect(f.state).toEqual(before);

    expect(f.accept()).toBe(false);
    expect(f.state.players[0].deck).toHaveLength(deckBefore - 2);
    // A duplicate of the same answer finds no prompt and changes nothing.
    const after = structuredClone(f.state);
    expect(f.accept()).toBe(true);
    expect(f.state).toEqual(after);
    expect(
      coordinator.routePromptResponse(f.state, 0, {
        ...acceptAction,
        promptId: "stale-prompt",
      } as GameAction)
    ).toMatchObject({ kind: "reject", reason: "That prompt response is stale" });
  });
});

// ─── EB04-001 Jewelry Bonney ─────────────────────────────────────────────────

describe("OPT-799 EB04-001 Jewelry Bonney — condition first, then choice", () => {
  function activate(lifeCount: number) {
    const f = fixture();
    const leader = f.put("EB04-001", 0, "LEADER");
    const victim = f.put("OPT799-OPP", 1, "CHARACTER", { power: 5000 });
    f.state.players[0].life = f.state.players[0].life.slice(0, lifeCount);
    const handBefore = f.state.players[0].hand.length;
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: leader.instanceId,
      effectId: "activate_debuff_life",
    });
    // No block-level prompt: the −1000 is mandatory ("up to 1" target).
    expect(f.promptType()).toBe("SELECT_TARGET");
    expect(f.select([victim.instanceId])).toBe(false);
    const power = () =>
      getEffectivePower(
        f.state.players[1].characters.find((c) => c?.instanceId === victim.instanceId)!,
        f.db.get(victim.cardId)!,
        f.state,
        f.db
      );
    return { f, handBefore, power };
  }

  it.each([1, 0])("with %i Life there is no prompt and nothing moves", (life) => {
    const { f, handBefore, power } = activate(life);
    expect(f.prompt()).toBeNull();
    expect(f.state.effectStack).toEqual([]);
    expect(f.state.players[0].life).toHaveLength(life);
    expect(f.state.players[0].hand).toHaveLength(handBefore);
    expect(power()).toBe(4000);
  });

  it("with 2 Life asks, and accept adds the top Life card to hand", () => {
    const { f, handBefore, power } = activate(2);
    const bottom = f.state.players[0].life[1].instanceId;
    const { options, respondingPlayer } = f.optionalPrompt();
    expect(respondingPlayer).toBe(0);
    expect(options.effectDescription).toBe(
      "Then, if you have 2 or more Life cards, you may add 1 card from the top of your Life cards to your hand."
    );
    expect(power()).toBe(4000);
    expect(f.accept()).toBe(false);
    expect(f.prompt()).toBeNull();
    expect(f.state.players[0].life).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(handBefore + 1);
    // The top card left; the other Life card stays.
    expect(f.state.players[0].life[0].instanceId).toBe(bottom);
  });

  it("with 5 Life, decline leaves Life and hand untouched and keeps the −1000", () => {
    const { f, handBefore, power } = activate(5);
    f.optionalPrompt();
    expect(f.decline()).toBe(false);
    expect(f.prompt()).toBeNull();
    expect(f.state.effectStack).toEqual([]);
    expect(f.state.players[0].life).toHaveLength(5);
    expect(f.state.players[0].hand).toHaveLength(handBefore);
    expect(power()).toBe(4000);
  });
});

// ─── P-036 Monkey.D.Luffy ────────────────────────────────────────────────────

describe("OPT-799 P-036 Monkey.D.Luffy — and up to 1 of your Leader", () => {
  function attack() {
    const f = fixture();
    const luffy = f.put("P-036", 0, "CHARACTER", { power: 5000 });
    const leader = f.state.players[0].leader;
    const lifeBefore = f.state.players[0].life.length;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: luffy.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    expect(f.optionalPrompt().options.effectDescription).toContain(
      "You may add 1 card from the top or bottom of your Life cards"
    );
    expect(f.accept()).toBe(false);
    // Life-to-hand cost: choose the top when asked.
    for (let i = 0; i < 3 && f.promptType() !== "OPTIONAL_EFFECT"; i++) {
      const p = f.prompt();
      if (p?.options.promptType === "PLAYER_CHOICE") {
        const choice = p.options.choices.find((c) => /top/i.test(c.id + c.label)) ?? p.options.choices[0];
        expect(f.respond({ type: "PLAYER_CHOICE", choiceId: choice.id })).toBe(false);
      } else if (p?.options.promptType === "SELECT_TARGET") {
        expect(f.select(p.options.validTargets.slice(0, 1))).toBe(false);
      } else break;
    }
    const powerOf = (card: CardInstance) => {
      const live =
        card.zone === "LEADER"
          ? f.state.players[0].leader
          : f.state.players[0].characters.find((c) => c?.instanceId === card.instanceId)!;
      return getEffectivePower(live, f.db.get(live.cardId)!, f.state, f.db);
    };
    return { f, luffy, leader, lifeBefore, powerOf };
  }

  it("boosts this Character, then asks about the Leader; accept boosts both", () => {
    const { f, luffy, leader, lifeBefore, powerOf } = attack();
    expect(f.state.players[0].life).toHaveLength(lifeBefore - 1);
    const { options, respondingPlayer } = f.optionalPrompt();
    expect(respondingPlayer).toBe(0);
    expect(options.effectDescription).toBe(
      "This Character and up to 1 of your Leader gain +1000 power during this turn."
    );
    expect(powerOf(luffy)).toBe(6000);
    expect(powerOf(leader)).toBe(5000);
    expect(f.accept()).toBe(false);
    expect(powerOf(luffy)).toBe(6000);
    expect(powerOf(leader)).toBe(6000);
    expect(f.promptType()).not.toBe("OPTIONAL_EFFECT");
  });

  it("decline (choosing 0 Leaders) keeps only this Character's +1000", () => {
    const { f, luffy, leader, powerOf } = attack();
    f.optionalPrompt();
    expect(f.decline()).toBe(false);
    expect(powerOf(luffy)).toBe(6000);
    expect(powerOf(leader)).toBe(5000);
    expect(f.promptType()).not.toBe("OPTIONAL_EFFECT");
  });
});

// ─── Dependent clauses (synthetic block) ─────────────────────────────────────

describe("OPT-799 declined vs performed optional action and its dependents", () => {
  // "You may trash 1 card from the top of your deck. If you do, draw 1 card.
  //  Then, trash 1 card from the top of your deck."
  const block: EffectBlock = {
    id: "opt799_synthetic",
    category: "auto",
    actions: [
      { type: "MILL", params: { amount: 1 }, optional: true },
      { type: "DRAW", params: { amount: 1 }, chain: "IF_DO" },
      { type: "MILL", params: { amount: 1 }, chain: "THEN" },
    ],
  };

  function start() {
    const f = fixture();
    const source = f.state.players[0].leader.instanceId;
    const result = resolveEffect(f.state, block, source, 0, f.db);
    f.state = { ...result.state, pendingPrompt: result.pendingPrompt ?? null };
    return {
      f,
      deck: f.state.players[0].deck.length,
      hand: f.state.players[0].hand.length,
      logStart: f.state.eventLog.length,
    };
  }

  it("decline skips the IF_DO dependent but the THEN clause still resolves", () => {
    const { f, deck, hand, logStart } = start();
    expect(f.optionalPrompt().respondingPlayer).toBe(0);
    expect(f.decline()).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(hand);
    expect(f.state.players[0].deck).toHaveLength(deck - 1);
    expect(trashFromDeckCount(f, 0, logStart)).toBe(1);
    expect(f.state.effectStack).toEqual([]);
  });

  it("accept performs the clause, its IF_DO dependent, and the THEN clause", () => {
    const { f, deck, hand, logStart } = start();
    expect(f.accept()).toBe(false);
    expect(f.state.players[0].hand).toHaveLength(hand + 1);
    expect(f.state.players[0].deck).toHaveLength(deck - 3);
    expect(trashFromDeckCount(f, 0, logStart)).toBe(2);
  });

  it("an IF_DO optional whose prerequisite failed is skipped without a prompt", () => {
    const f = fixture();
    f.state.players[0].deck = [];
    const result = resolveEffect(
      f.state,
      {
        id: "opt799_if_do_optional",
        category: "auto",
        actions: [
          { type: "MILL", params: { amount: 1 }, result_ref: "milled" },
          {
            type: "DRAW",
            params: { amount: 1 },
            chain: "IF_DO",
            optional: true,
          },
        ],
      },
      f.state.players[0].leader.instanceId,
      0,
      f.db
    );
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.effectStack).toEqual([]);
  });
});

// ─── OPT-893: optional shapes whose handler offers no zero choice ───────────

describe("OPT-893 optional clause is the only decline when no zero-choice prompt exists", () => {
  function start(action: Action) {
    const f = fixture();
    const block: EffectBlock = {
      id: "opt893_synthetic",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [action],
    };
    expect(validateEffectSchema({ card_id: "OPT893-X", effects: [block] } as EffectSchema)).toEqual([]);
    const result = resolveEffect(f.state, block, f.state.players[0].leader.instanceId, 0, f.db);
    f.state = { ...result.state, pendingPrompt: result.pendingPrompt ?? null };
    return f;
  }
  const trashOpponentLife: Action = {
    type: "TRASH_FROM_LIFE",
    target: { type: "OPPONENT_LIFE" },
    params: { amount: 1 },
    optional: true,
  };

  it("optional TRASH_FROM_LIFE on OPPONENT_LIFE asks once (OPTIONAL_EFFECT) and accept trashes 1", () => {
    const f = start(trashOpponentLife);
    const life = f.state.players[1].life.length;
    expect(life).toBeGreaterThan(1);
    const prompts: string[] = [String(f.promptType())];
    expect(f.optionalPrompt().respondingPlayer).toBe(0);
    expect(f.accept()).toBe(false);
    if (f.prompt()) prompts.push(String(f.promptType()));
    expect(prompts).toEqual(["OPTIONAL_EFFECT"]);
    expect(f.state.players[1].life).toHaveLength(life - 1);
  });

  it("declining the OPTIONAL_EFFECT leaves the opponent's Life untouched", () => {
    const f = start(trashOpponentLife);
    const life = f.state.players[1].life.length;
    expect(f.decline()).toBe(false);
    expect(f.prompt()).toBeNull();
    expect(f.state.players[1].life).toHaveLength(life);
  });

  it("optional TRASH_FROM_HAND with amount 1 asks OPTIONAL_EFFECT, then a SELECT_TARGET that cannot choose 0", () => {
    const f = start({
      type: "TRASH_FROM_HAND",
      target: { type: "CARD_IN_HAND", controller: "SELF" },
      params: { amount: 1 },
      optional: true,
    });
    expect(f.state.players[0].hand.length).toBeGreaterThan(1);
    expect(f.optionalPrompt().respondingPlayer).toBe(0);
    expect(f.accept()).toBe(false);
    const options = f.prompt()?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET") throw new Error("expected SELECT_TARGET");
    expect(options.countMin).toBe(1);
    expect(options.countMax).toBe(1);
  });
});

// ─── Clause text extraction ──────────────────────────────────────────────────

describe("OPT-799 optional clause text", () => {
  it.each([
    [
      "[Activate: Main] [Once Per Turn] You may K.O. 1 of your Characters with a type including \"Baroque Works\": Give up to 1 of your opponent's Characters −10 cost during this turn. Then, you may trash 2 cards from the top of your deck.",
      "Then, you may trash 2 cards from the top of your deck.",
    ],
    [
      "[Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters −1000 power during this turn. Then, if you have 2 or more Life cards, you may add 1 card from the top of your Life cards to your hand.",
      "Then, if you have 2 or more Life cards, you may add 1 card from the top of your Life cards to your hand.",
    ],
    [
      TEXT["P-036"],
      "This Character and up to 1 of your Leader gain +1000 power during this turn.",
    ],
    // Two candidate clauses: never guess — name the whole block.
    ["You may draw 1 card. Then, you may trash 1 card.", "You may draw 1 card. Then, you may trash 1 card."],
  ])("%s", (text, expected) => {
    expect(optionalClauseDescription(text)).toBe(expected);
  });

  it("falls back to a generic line without text", () => {
    expect(optionalClauseDescription(undefined)).toBe("You may resolve this effect.");
  });
});

// ─── Schema contract and consumer inventory ──────────────────────────────────

describe("OPT-799 schema validation of action-level optional", () => {
  function errorsFor(effects: EffectBlock[]): string[] {
    return validateEffectSchema({ card_id: "OPT799-X", effects } as EffectSchema);
  }
  const auto = (actions: EffectBlock["actions"], extra: Partial<EffectBlock> = {}): EffectBlock => ({
    id: "b",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions,
    ...extra,
  });

  it("accepts a top-level optional clause", () => {
    expect(
      errorsFor([
        auto([
          { type: "DRAW", params: { amount: 1 } },
          { type: "MILL", params: { amount: 2 }, chain: "THEN", optional: true },
        ]),
      ])
    ).toEqual([]);
  });

  it.each([
    [
      "an up_to target",
      auto([
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
          optional: true,
        },
      ]),
      "target.count already allows choosing 0",
    ],
    [
      "an OP04-044-shaped dual_targets slot that allows zero",
      auto([
        {
          type: "RETURN_TO_HAND",
          target: {
            type: "CHARACTER",
            controller: "EITHER",
            dual_targets: [
              { filter: { cost_max: 8 }, count: { up_to: 1 } },
              { filter: { cost_max: 3 }, count: { up_to: 1 } },
            ],
          },
          optional: true,
        },
      ]),
      "target.dual_targets[0].count already allows choosing 0",
    ],
    [
      "an any_number target",
      auto([
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { any_number: true } },
          optional: true,
        },
      ]),
      "target.count already allows choosing 0",
    ],
    [
      "params.optional",
      auto([
        {
          type: "TRASH_FROM_HAND",
          params: { amount: 1, optional: true },
          optional: true,
        },
      ]),
      "params.optional already makes this action optional",
    ],
    [
      "an AND group",
      auto([
        { type: "DRAW", params: { amount: 1 }, optional: true },
        { type: "MILL", params: { amount: 1 }, chain: "AND" },
      ]),
      "cannot be part of an AND transaction",
    ],
    [
      "a block-level optional on the same first clause",
      auto([{ type: "DRAW", params: { amount: 1 }, optional: true }], {
        flags: { optional: true },
      }),
      "block flags.optional already asks",
    ],
    [
      "a nested action",
      auto([
        {
          type: "PLAYER_CHOICE",
          params: {
            options: [
              [{ type: "DRAW", params: { amount: 1 }, optional: true }],
              [{ type: "MILL", params: { amount: 1 } }],
            ],
          },
        },
      ]),
      "only supported on a block's top-level actions",
    ],
    [
      "optional: false",
      auto([{ type: "DRAW", params: { amount: 1 }, optional: false as unknown as true }]),
      "Expected true",
    ],
  ])("rejects %s", (_label, block, message) => {
    expect(errorsFor([block]).join("\n")).toContain(message);
  });

  // OPT-893: the zero-allowed verdict must equal the prompt the resolver
  // issues. Each row's `expectedPromptCountMin` is the countMin the resolver
  // gives buildSelectTargetPrompt for that target shape (exact -> N, summed
  // across dual slots; up_to / any_number / omitted count -> 0).
  const bounce = (target: Target): EffectBlock =>
    auto([{ type: "RETURN_TO_HAND", target, optional: true }]);
  it.each<[string, Target, number, boolean]>([
    ["omitted count on opponent Characters", { type: "CHARACTER", controller: "OPPONENT" }, 0, true],
    ["exact 1", { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } }, 1, false],
    ["up_to 1", { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } }, 0, true],
    ["any_number", { type: "CHARACTER", controller: "OPPONENT", count: { any_number: true } }, 0, true],
    ["all", { type: "CHARACTER", controller: "OPPONENT", count: { all: true } }, 0, false],
    ["deterministic SELF without count", { type: "SELF" }, 0, false],
    [
      "mixed dual slots exact 1 + up_to 1",
      {
        type: "CHARACTER",
        controller: "EITHER",
        dual_targets: [
          { filter: { cost_max: 8 }, count: { exact: 1 } },
          { filter: { cost_max: 3 }, count: { up_to: 1 } },
        ],
      },
      1,
      false,
    ],
    [
      "dual slots up_to 1 + up_to 1",
      {
        type: "CHARACTER",
        controller: "EITHER",
        dual_targets: [
          { filter: { cost_max: 8 }, count: { up_to: 1 } },
          { filter: { cost_max: 3 }, count: { up_to: 1 } },
        ],
      },
      0,
      true,
    ],
    [
      "mixed_pool total_count exact 1",
      {
        mixed_pool: { types: ["CHARACTER", "STAGE"], total_count: { exact: 1 } },
        controller: "OPPONENT",
      } as Target,
      1,
      false,
    ],
  ])("optional verdict matches resolver prompt: %s", (_label, target, promptMin, rejected) => {
    expect(targetPromptCountMin(target)).toBe(promptMin);
    const errors = errorsFor([bounce(target)]).filter((e) => e.includes(".optional:"));
    expect(errors.length > 0).toBe(rejected);
  });

  it("names the count-less target in the omitted-count rejection", () => {
    const errors = errorsFor([bounce({ type: "CHARACTER", controller: "OPPONENT" })]);
    expect(errors.join("\n")).toContain("omits count");
  });

  // OPT-893 fix round: the omitted-count rule applies only where the handler
  // builds SELECT_TARGET from the target's count and the target type can offer
  // more than one candidate. Elsewhere no zero-choice prompt exists, so
  // action-level optional is the only decline and must be accepted.
  it.each<[string, Action, boolean]>([
    [
      "TRASH_FROM_LIFE on OPPONENT_LIFE (handler never prompts)",
      { type: "TRASH_FROM_LIFE", target: { type: "OPPONENT_LIFE" }, params: { amount: 1 }, optional: true },
      false,
    ],
    [
      "LIFE_TO_HAND on the top Life card (handler never prompts from target)",
      { type: "LIFE_TO_HAND", target: { type: "LIFE_CARD", controller: "SELF" }, params: { amount: 1 }, optional: true },
      false,
    ],
    [
      "LIFE_TO_HAND without a target",
      { type: "LIFE_TO_HAND", params: { amount: 1, position: "TOP_OR_BOTTOM" }, optional: true },
      false,
    ],
    [
      "TRASH_FROM_HAND with amount (own prompt, countMin = amount)",
      { type: "TRASH_FROM_HAND", target: { type: "CARD_IN_HAND", controller: "SELF" }, params: { amount: 1 }, optional: true },
      false,
    ],
    [
      "REVEAL on CARD_ON_TOP_OF_DECK",
      { type: "REVEAL", target: { type: "CARD_ON_TOP_OF_DECK", controller: "OPPONENT" }, optional: true },
      false,
    ],
    [
      "APPLY_PROHIBITION on PLAYER (prompting handler, single-candidate pool)",
      {
        type: "APPLY_PROHIBITION",
        target: { type: "PLAYER", controller: "OPPONENT" },
        params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" },
        duration: { type: "THIS_TURN" },
        optional: true,
      } as Action,
      false,
    ],
    [
      "KO on a single-controller STAGE (one Stage per player)",
      { type: "KO", target: { type: "STAGE", controller: "OPPONENT" }, optional: true },
      false,
    ],
    [
      "RETURN_TO_HAND on opponent Characters without count (original ticket case)",
      { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT" }, optional: true },
      true,
    ],
    [
      "KO on SELECTED_CARDS without count (prompting handler, multi-card ref)",
      { type: "KO", target: { type: "SELECTED_CARDS", ref: "picked" }, optional: true },
      true,
    ],
    [
      "TRASH_FROM_HAND with up_to 1 (own prompt honors up_to)",
      { type: "TRASH_FROM_HAND", target: { type: "CARD_IN_HAND", controller: "SELF", count: { up_to: 1 } }, optional: true },
      true,
    ],
  ])("optional verdict per handler prompt: %s", (_label, action, rejected) => {
    const errors = errorsFor([auto([action])]).filter((e) => e.includes(".optional:"));
    expect(errors.length > 0, errors.join("\n")).toBe(rejected);
  });

  it("rejects optional on the authored OP04-044 dual-target bounce", () => {
    const schema = structuredClone(getEffectSchema("OP04-044")!);
    const bounce = schema.effects[0].actions![0];
    expect(bounce.target?.dual_targets).toHaveLength(2);
    bounce.optional = true;
    expect(validateEffectSchema(schema, "OP04-044").join("\n")).toContain(
      "target.dual_targets[0].count already allows choosing 0"
    );
  });

  it("only the re-authored cards carry action-level optional in the registry", () => {
    const users: string[] = [];
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      schema.effects.forEach((block, b) => {
        const walk = (value: unknown, path: string): void => {
          if (Array.isArray(value)) {
            value.forEach((child, i) => walk(child, `${path}[${i}]`));
            return;
          }
          if (!value || typeof value !== "object") return;
          const record = value as Record<string, unknown>;
          if (typeof record.type === "string" && "optional" in record)
            users.push(`${cardId} ${path}`);
          for (const [key, child] of Object.entries(record))
            walk(child, `${path}.${key}`);
        };
        walk(block.actions, `effects[${b}].actions`);
        walk(block.replacement_actions, `effects[${b}].replacement_actions`);
      });
    }
    expect(users.sort()).toEqual([
      "EB04-001 effects[1].actions[1]",
      "OP14-079 effects[1].actions[1]",
      "P-036 effects[0].actions[1]",
    ]);
  });
});
