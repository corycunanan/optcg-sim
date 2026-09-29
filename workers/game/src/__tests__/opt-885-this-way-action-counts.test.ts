/**
 * OPT-885 — `*_THIS_WAY` PER_COUNT sources count cards moved by a preceding
 * ACTION (not only by a cost).
 *
 * Expected behavior comes from canonical card text, not the implementation:
 *   OP15-002 Lucy (docs/cards/OP-15.md:14) — "[When Attacking]/[On Your
 *     Opponent's Attack] You may trash any number of Event or Stage cards from
 *     your hand. This Leader gains +1000 power during this battle for every
 *     card trashed."
 *   OP06-095 (docs/cards/OP-06.md:666) — "+1000 during this turn. Then, you may
 *     K.O. any number of your {Thriller Bark Pirates} type Characters with a
 *     cost of 2 or less. Your Leader gains an additional +1000 power during
 *     this turn for every Character K.O.'d."
 *   OP09-059 (docs/cards/OP-09.md:404) — "... Then, trash up to 2 cards from
 *     your hand. Trash the same number of cards from the top of your deck as
 *     you did from your hand."
 *   OP07-091 (docs/cards/OP-07.md:646; qa_op07.md:143-147) — "+1000 power
 *     during this turn for every 3 cards placed at the bottom of your deck";
 *     FAQ: placing 5 gives +1000.
 *   P-059 (docs/cards/UNKNOWN.md:359) — "you may return any number of
 *     Characters on your field to the owner's hand. Up to 1 of your Leader or
 *     Character cards gains +2000 power during this battle for every returned
 *     Character."
 * Cost-sourced regression: P-051 Shanks (cost TRASH_FROM_HAND ANY_NUMBER).
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { findCardInstance } from "../engine/state.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    // Life without [Trigger] so a battle resolves without extra prompts.
    p.life = p.life.map((l) => ({ ...l, cardId: CARDS.VANILLA.id }));
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {},
  ) {
    const schema = getEffectSchema(id);
    if (!db.has(id) || Object.keys(data).length > 0) {
      db.set(id, {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id,
        name: schema?.card_name ?? id,
        cost: 3,
        power: 4000,
        effectText: "",
        ...data,
        ...(schema ? { effectSchema: schema } : {}),
      });
    }
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "TRASH") state.players[owner].trash.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else if (zone === "STAGE") state.players[owner].stage = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((x) => !x)
      ] = c;
    if (zone !== "HAND" && zone !== "TRASH")
      state = registerCardEnteredField(state, c, db.get(id)!);
    return c;
  }
  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  const f = {
    db,
    put,
    act,
    select(ids: string[]) {
      expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
    },
    choose(choiceId: "accept" | "skip") {
      expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      act({ type: "PLAYER_CHOICE", choiceId });
    },
    power(card: CardInstance) {
      const live = findCardInstance(state, card.instanceId) ?? card;
      return getEffectivePower(live, db.get(live.cardId)!, state, db);
    },
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state() {
      return state;
    },
  };
  return f;
}

type Fixture = ReturnType<typeof fixture>;

/** Finish the current battle: no block, no counter, damage resolves. */
function finishBattle(f: Fixture, defender: 0 | 1) {
  f.act({ type: "PASS" }, defender); // block step
  f.act({ type: "PASS" }, defender); // counter step
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.turn.battle).toBeNull();
}

function setupLucy(f: Fixture, owner: 0 | 1) {
  const lucy = f.put("OP15-002", owner, "LEADER", {
    type: "Leader",
    color: ["Red", "Blue"],
    power: 5000,
  });
  const events = [0, 1, 2].map(() =>
    f.put("evt", owner, "HAND", { type: "Event", effectText: "" }),
  );
  const stage = f.put("stg", owner, "HAND", { type: "Stage", effectText: "" });
  const character = f.put("chr", owner, "HAND", { type: "Character" });
  return { lucy, events, stage, character };
}

describe("OPT-885 OP15-002 Lucy — +1000 per card trashed by the TRASH_FROM_HAND action", () => {
  describe.each(["WHEN_ATTACKING", "ON_OPPONENT_ATTACK"] as const)("%s", (keyword) => {
    const owner: 0 | 1 = keyword === "WHEN_ATTACKING" ? 0 : 1;
    const defender: 0 | 1 = 1;

    function attack(f: Fixture, lucy: CardInstance) {
      f.act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId:
            keyword === "WHEN_ATTACKING" ? lucy.instanceId : f.state.players[0].leader.instanceId,
          targetInstanceId: f.state.players[1].leader.instanceId,
        },
        0,
      );
    }

    it.each([
      [0, 5000],
      [1, 6000],
      [2, 7000],
    ] as const)("trashing %i eligible card(s) → %i during this battle only", (n, expected) => {
      const f = fixture();
      const { lucy, events, stage, character } = setupLucy(f, owner);
      attack(f, lucy);
      f.choose("accept");
      const prompt = f.state.pendingPrompt?.options;
      expect(prompt?.promptType).toBe("SELECT_TARGET");
      if (prompt?.promptType !== "SELECT_TARGET") throw new Error("no hand prompt");
      // Only Event/Stage cards are selectable.
      expect(prompt.validTargets).not.toContain(character.instanceId);
      const picks = [events[0], stage].slice(0, n).map((c) => c.instanceId);
      // Persist across the hand-selection pause (DO storage round-trip).
      f.roundTrip();
      f.select(picks);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[owner].trash).toHaveLength(n);
      expect(f.state.players[owner].hand).toHaveLength(5 - n);
      expect(f.power(lucy)).toBe(expected);
      finishBattle(f, defender);
      // "during this battle" — expired once the battle ends.
      expect(f.power(lucy)).toBe(5000);
    });

    it("an ineligible card in the selection is not trashed and not counted", () => {
      const f = fixture();
      const { lucy, events, character } = setupLucy(f, owner);
      attack(f, lucy);
      f.choose("accept");
      const r = resumePromptLifecycle(
        f.state,
        { type: "SELECT_TARGET", selectedInstanceIds: [events[0].instanceId, character.instanceId] },
        f.db,
        { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
      );
      // Selection is validated before the handler runs: nothing moves and
      // the prompt stays open; a legal re-selection counts only what moved.
      expect(r.responseRejected).toBe(true);
      expect(r.state.players[owner].trash).toHaveLength(0);
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      f.select([events[0].instanceId]);
      expect(f.state.players[owner].trash.map((c) => c.cardId)).toEqual(["evt"]);
      expect(f.power(lucy)).toBe(6000);
    });

    it("declining trashes nothing and grants no power", () => {
      const f = fixture();
      const { lucy } = setupLucy(f, owner);
      attack(f, lucy);
      f.choose("skip");
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[owner].hand).toHaveLength(5);
      expect(f.state.players[owner].trash).toHaveLength(0);
      expect(f.power(lucy)).toBe(5000);
    });
  });

  it("a later resolution does not read an earlier resolution's count", () => {
    const f = fixture();
    const { lucy, events } = setupLucy(f, 1);
    // First opponent attack: trash 2 → 7000, battle ends.
    f.act(
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: f.state.players[0].leader.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      },
      0,
    );
    f.choose("accept");
    f.select([events[0].instanceId, events[1].instanceId]);
    expect(f.power(lucy)).toBe(7000);
    finishBattle(f, 1);
    // Second attack, by a Character played on an earlier turn: trash 0.
    const attacker = f.put("attacker", 0, "CHARACTER", { power: 5000 });
    f.act(
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      },
      0,
    );
    f.choose("accept");
    f.select([]);
    expect(f.power(lucy)).toBe(5000);
  });
});

describe("OPT-885 other action-sourced *_THIS_WAY consumers", () => {
  const OP06_095_TEXT =
    "[Main]/[Counter] Your Leader gains +1000 power during this turn. Then, you may K.O. any number of your {Thriller Bark Pirates} type Characters with a cost of 2 or less. Your Leader gains an additional +1000 power during this turn for every Character K.O.'d.";

  /**
   * The authored OP06-095 block, optionally rewrapped with a plain MAIN_EVENT
   * trigger. The authored `any_of: [MAIN_EVENT, COUNTER_EVENT]` block is never
   * found by PLAY_CARD (execute.ts matches only a top-level `keyword`), so the
   * wrapped variant exercises the authored KO → PER_COUNT actions unchanged.
   */
  function playOp06095(f: Fixture, n: number, wrapped: boolean) {
    const kos = [0, 1].map(() =>
      f.put("tb", 0, "CHARACTER", { cost: 2, types: ["Thriller Bark Pirates"] }),
    );
    const authored = getEffectSchema("OP06-095")!;
    const id = wrapped ? "OP06-095-main-only" : "OP06-095";
    const event = f.put(id, 0, "HAND", {
      type: "Event",
      cost: 1,
      effectText: OP06_095_TEXT,
      ...(wrapped
        ? {
            effectSchema: {
              ...authored,
              card_id: id,
              effects: [{ ...authored.effects[0], trigger: { keyword: "MAIN_EVENT" } }],
            },
          }
        : {}),
    });
    const leader = f.state.players[0].leader;
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.roundTrip();
    f.select(kos.slice(0, n).map((c) => c.instanceId));
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].characters.filter(Boolean)).toHaveLength(2 - n);
    expect(f.power(leader)).toBe(5000 + 1000 + 1000 * n);
  }

  it.each([0, 1, 2])("OP06-095 authored actions: K.O. %i → Leader +1000 +1000×N this turn", (n) => {
    playOp06095(fixture(), n, true);
  });

  // Follow-up (reported on the OPT-885 PR): an Event whose block trigger is
  // `any_of: [MAIN_EVENT, COUNTER_EVENT]` never resolves from PLAY_CARD.
  it.fails("OP06-095 as authored resolves when played (any_of MAIN/COUNTER gap — follow-up)", () => {
    playOp06095(fixture(), 1, false);
  });

  /**
   * Rule 6-2 batch pause: when a K.O.'d Character has an [On K.O.] (OP15-079
   * Absalom — docs/cards/OP-15.md:580, "[On K.O.] Add up to 1 {Thriller Bark
   * Pirates} type card from your trash to your hand."), the KO handler pauses
   * for that trigger before OP06-095's PER_COUNT runs. The bonus must still be
   * +1000 per Character actually K.O.'d, across a persistence round-trip at the
   * trigger's prompt.
   */
  it.each([
    ["accept", 2],
    ["accept", 3],
    ["skip", 2],
  ] as const)("OP06-095 K.O. batch paused by an [On K.O.] (%s the trigger, K.O. %i) keeps the count", (answer, n) => {
    const f = fixture();
    const absalom = f.put("OP15-079", 0, "CHARACTER", {
      cost: 2,
      color: ["Black"],
      types: ["Thriller Bark Pirates"],
    });
    const others = [0, 1].map(() =>
      f.put("tb", 0, "CHARACTER", { cost: 2, types: ["Thriller Bark Pirates"] }),
    );
    const bystander = f.put("tb", 0, "CHARACTER", { cost: 2, types: ["Thriller Bark Pirates"] });
    const inTrash = f.put("tb", 0, "TRASH", { cost: 2, types: ["Thriller Bark Pirates"] });
    const authored = getEffectSchema("OP06-095")!;
    const id = "OP06-095-main-only";
    const event = f.put(id, 0, "HAND", {
      type: "Event",
      cost: 1,
      effectText: OP06_095_TEXT,
      effectSchema: {
        ...authored,
        card_id: id,
        effects: [{ ...authored.effects[0], trigger: { keyword: "MAIN_EVENT" } }],
      },
    });
    const leader = f.state.players[0].leader;
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.select([absalom, ...others].slice(0, n).map((c) => c.instanceId));
    // Absalom's [On K.O.] is pending before the PER_COUNT action resolves.
    expect(f.state.pendingPrompt).not.toBeNull();
    f.roundTrip();
    for (let guard = 0; f.state.pendingPrompt && guard < 5; guard++) {
      const options = f.state.pendingPrompt.options;
      if (options.promptType === "OPTIONAL_EFFECT") f.choose(answer);
      else if (options.promptType === "SELECT_TARGET") {
        f.roundTrip();
        f.select(answer === "accept" ? [inTrash.instanceId] : []);
      } else throw new Error(`unexpected prompt ${options.promptType}`);
    }
    expect(f.state.pendingPrompt).toBeNull();
    const field = f.state.players[0].characters.filter(Boolean).map((c) => c!.instanceId);
    expect(field).toEqual([...others.slice(n - 1).map((c) => c.instanceId), bystander.instanceId]);
    // Absalom returned the pre-placed trash card (a zone move mints a new id).
    expect(f.state.players[0].hand.map((c) => c.cardId)).toEqual(answer === "accept" ? ["tb"] : []);
    expect(f.state.players[0].trash.some((c) => c.instanceId === inTrash.instanceId)).toBe(answer !== "accept");
    // "+1000 ... Then ... an additional +1000 for every Character K.O.'d."
    expect(f.power(leader)).toBe(5000 + 1000 + 1000 * n);
  });

  it.each([0, 1, 2])("OP09-059 trashes %i from hand → mills the same number", (n) => {
    const f = fixture();
    const handCards = [0, 1, 2].map(() => f.put("fodder", 1, "HAND"));
    const counter = f.put("OP09-059", 1, "HAND", {
      type: "Event",
      cost: 1,
      effectText:
        "[Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle. Then, trash up to 2 cards from your hand. Trash the same number of cards from the top of your deck as you did from your hand.",
    });
    const deckBefore = f.state.players[1].deck.length;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    }, 0);
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: f.state.players[1].leader.instanceId,
      },
      1,
    );
    if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET"
      && f.state.pendingPrompt.options.validTargets.includes(f.state.players[1].leader.instanceId)) {
      f.select([f.state.players[1].leader.instanceId]);
    }
    f.roundTrip();
    f.select(handCards.slice(0, n).map((c) => c.instanceId));
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(3 - n);
    expect(f.state.players[1].deck).toHaveLength(deckBefore - n);
  });

  it.each([
    [2, 4000],
    [3, 5000],
    [5, 5000],
    [6, 6000],
  ] as const)("OP07-091 places %i from trash → power %i this turn", (n, expected) => {
    const f = fixture();
    const luffy = f.put("OP07-091", 0, "CHARACTER", { power: 4000, cost: 5 });
    luffy.turnPlayed = 1;
    const trash = Array.from({ length: 6 }, () =>
      f.put("big", 0, "TRASH", { type: "Character", cost: 4 }),
    );
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: luffy.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    // No opponent Character to trash → the RETURN_TO_DECK selection opens.
    f.roundTrip();
    f.select(trash.slice(0, n).map((c) => c.instanceId));
    // Owner arranges the bottom order when more than one card moves.
    let guard = 0;
    while (f.state.pendingPrompt?.options.promptType === "ARRANGE_TOP_CARDS" && guard++ < 3) {
      const cards = f.state.pendingPrompt.options.cards.map((c) => c.instanceId);
      f.act({
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: cards,
        destination: "bottom",
      });
    }
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].trash).toHaveLength(6 - n);
    expect(f.power(luffy)).toBe(expected);
  });

  const P_059_TEXT =
    "[Counter] If your Leader is [Uta], you may return any number of Characters on your field to the owner's hand. Up to 1 of your Leader or Character cards gains +2000 power during this battle for every returned Character.";

  /**
   * The authored P-059 block is `category: "activate"`, which
   * USE_COUNTER_EVENT never runs (OPT-894 owns that). The `auto` variant
   * exercises the authored RETURN_TO_HAND → PER_COUNT actions unchanged.
   */
  function counterP059(f: Fixture, n: number, wrapped: boolean) {
    f.put("uta", 1, "LEADER", { type: "Leader", name: "Uta", power: 5000 });
    const leader = f.state.players[1].leader;
    const chars = [0, 1].map(() => f.put("c", 1, "CHARACTER"));
    const authored = getEffectSchema("P-059")!;
    const id = wrapped ? "P-059-auto" : "P-059";
    const counter = f.put(id, 1, "HAND", {
      type: "Event",
      cost: 1,
      effectText: P_059_TEXT,
      ...(wrapped
        ? {
            effectSchema: {
              ...authored,
              card_id: id,
              effects: [{ ...authored.effects[0], category: "auto" as const }],
            },
          }
        : {}),
    });
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: leader.instanceId,
    }, 0);
    f.act({ type: "PASS" }, 1);
    f.act(
      {
        type: "USE_COUNTER_EVENT",
        cardInstanceId: counter.instanceId,
        counterTargetInstanceId: leader.instanceId,
      },
      1,
    );
    f.choose("accept");
    f.roundTrip();
    f.select(chars.slice(0, n).map((c) => c.instanceId));
    // "Up to 1 of your Leader or Character cards" — pick the Leader.
    f.select([leader.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(2 - n);
    expect(f.power(leader)).toBe(5000 + 2000 * n);
    f.act({ type: "PASS" }, 1); // close the counter step; damage resolves
    expect(f.state.turn.battle).toBeNull();
    expect(f.power(leader)).toBe(5000);
  }

  it.each([0, 1, 2])("P-059 authored actions: return %i → +2000×N during this battle", (n) => {
    counterP059(fixture(), n, true);
  });

  it.fails("P-059 as authored resolves from USE_COUNTER_EVENT (OPT-894)", () => {
    counterP059(fixture(), 1, false);
  });
});

describe("OPT-885 re-authored no-colon \"trash any number\" cards (were ANY_NUMBER costs)", () => {
  // Each card text reads "You may trash any number of ... from your hand.
  // ... +1000 power during this battle for every card trashed." (no colon).
  // The former ANY_NUMBER TRASH_FROM_HAND cost prompted for exactly 1 card.
  const cases = [
    { id: "P-051", keyword: "WHEN_ATTACKING", data: { type: "Character" } as Partial<CardData> },
    { id: "OP03-001", keyword: "WHEN_ATTACKING", data: { type: "Leader" } as Partial<CardData> },
    { id: "OP03-001", keyword: "WHEN_ATTACKED", data: { type: "Leader" } as Partial<CardData> },
    { id: "OP06-014", keyword: "ON_OPPONENT_ATTACK", data: { type: "Character" } as Partial<CardData> },
    { id: "ST16-002", keyword: "ON_OPPONENT_ATTACK", data: { type: "Character" } as Partial<CardData> },
  ] as const;

  describe.each(cases)("$id $keyword", ({ id, keyword, data }) => {
    it.each([0, 1, 2])("trashing %i → +1000 each during this battle only", (n) => {
      const f = fixture();
      const owner: 0 | 1 = keyword === "WHEN_ATTACKING" ? 0 : 1;
      const isLeader = data.type === "Leader";
      const source = f.put(id, owner, isLeader ? "LEADER" : "CHARACTER", {
        ...data,
        power: 5000,
        cost: 4,
        types: ["FILM", "Music"],
      });
      source.turnPlayed = 1;
      const hand = [0, 1, 2].map(() =>
        f.put("fodder", owner, "HAND", { type: "Event", types: ["FILM", "Music"] }),
      );
      f.act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId:
            keyword === "WHEN_ATTACKING" ? source.instanceId : f.state.players[0].leader.instanceId,
          targetInstanceId:
            keyword === "WHEN_ATTACKED" ? source.instanceId : f.state.players[1].leader.instanceId,
        },
        0,
      );
      if (keyword === "WHEN_ATTACKED") f.act({ type: "PASS" }, 1); // no block
      f.choose("accept");
      f.roundTrip();
      f.select(hand.slice(0, n).map((c) => c.instanceId));
      // "Your Leader or 1 of your Characters" — pick the source.
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") f.select([source.instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[owner].trash).toHaveLength(n);
      expect(f.power(source)).toBe(5000 + 1000 * n);
      if (keyword === "WHEN_ATTACKED") {
        f.act({ type: "PASS" }, 1); // counter step
        expect(f.state.turn.battle).toBeNull();
      } else finishBattle(f, 1);
      expect(f.power(source)).toBe(5000);
    });
  });
});

describe("OPT-885 cost-sourced *_THIS_WAY regression", () => {
  // Real card OP13-001 (REST_DON ANY_NUMBER cost → DON_RESTED_THIS_WAY) is
  // covered end to end by opt-613-variable-don-rest-cost.test.ts. This pins
  // the no-shadowing rule: a block with BOTH a trash cost and a trash action
  // reads the cost count without `ref` and the action count with `ref`.
  it("a cost ref is not clobbered by a later action result in the same block", () => {
    const f = fixture();
    const source = f.put("synthetic", 0, "CHARACTER", {
      power: 5000,
      effectSchema: {
        card_id: "synthetic",
        card_name: "Synthetic",
        card_type: "Character",
        effects: [
          {
            id: "both",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
            actions: [
              {
                type: "TRASH_FROM_HAND",
                target: { type: "CARD_IN_HAND", controller: "SELF", count: { any_number: true } },
                result_ref: "action_trashed",
              },
              {
                type: "MODIFY_POWER",
                target: { type: "SELF" },
                params: { amount: { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", multiplier: 1000 } },
                duration: { type: "THIS_TURN" },
                chain: "THEN",
              },
              {
                type: "MODIFY_POWER",
                target: { type: "SELF" },
                params: {
                  amount: { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", ref: "action_trashed", multiplier: 100 },
                },
                duration: { type: "THIS_TURN" },
                chain: "THEN",
              },
            ],
          },
        ],
      },
    });
    const hand = [0, 1, 2, 3].map(() => f.put("fodder", 0, "HAND"));
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "both" });
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") f.choose("accept");
    f.select([hand[0].instanceId]); // cost: 1
    f.roundTrip();
    f.select([hand[1].instanceId, hand[2].instanceId]); // action: 2
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].trash).toHaveLength(3);
    // cost count 1 → +1000; action count 2 → +200.
    expect(f.power(source)).toBe(5000 + 1000 + 200);
  });
});
