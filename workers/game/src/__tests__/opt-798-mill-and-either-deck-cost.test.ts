/**
 * OPT-798 — "You may trash N cards from the top of your deck:" is an
 * activation cost (MILL cost), and "place 1 Character ... at the bottom of
 * the owner's deck" as a cost selects EITHER player's Character.
 *
 * Canonical text: docs/cards/EB-01.md:342, OP-07.md:568, EB-04.md:329/382,
 * OP-15.md:652, OP-04.md:385, OP-06.md:298.
 * Rulings: qa_eb01.md:124-128 (EB01-051 with ≤1 card in deck cannot be used),
 * faq_op15-eb04.md:423-427 (OP15-088 may play a card it trashed as the cost),
 * qa_op04.md:222-230 (OP04-055 may bottom-deck your own Character),
 * qa_op06.md:118-122 (OP06-043 cannot activate with no cost ≤2 Character on
 * either field). Rules 8-3-1, 8-3-1-1, 8-3-1-3, 8-3-1-4, 4-2-1-1.
 *
 * Every scenario runs the real pipeline with the registered authored schemas.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectiveCost } from "../engine/modifiers.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(id);
    if (!db.has(id) || Object.keys(data).length > 0 || schema) {
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
    if (zone === "DECK") state.players[owner].deck.unshift(c);
    else if (zone === "LIFE") state.players[owner].life.unshift({ ...c, face: "DOWN" });
    else if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "TRASH") state.players[owner].trash.unshift(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((slot) => !slot)
      ] = c;
    if (["LEADER", "CHARACTER"].includes(zone)) {
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }
  /** Replace a player's deck with `size` vanilla cards (index 0 = top). */
  function deck(owner: 0 | 1, size: number) {
    state.players[owner].deck = [];
    for (let i = 0; i < size; i++) put(`deck-filler-${owner}`, owner, "DECK");
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
  /** Submit a prompt response and return whether the lifecycle rejected it. */
  function respond(action: GameAction): boolean {
    const r = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    state = r.state;
    return r.responseRejected;
  }
  const promptType = () => state.pendingPrompt?.options.promptType;
  function accept() {
    expect(promptType()).toBe("OPTIONAL_EFFECT");
    act({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function decline() {
    expect(promptType()).toBe("OPTIONAL_EFFECT");
    act({ type: "PLAYER_CHOICE", choiceId: "skip" });
  }
  function select(ids: string[]) {
    act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }
  function validTargets(): string[] {
    const options = state.pendingPrompt?.options;
    return options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
  }
  function millEvents() {
    return state.eventLog.filter(
      (e) => e.type === "CARD_TRASHED" && e.payload.reason === "mill",
    );
  }
  return {
    db, put, deck, act, respond, accept, decline, select, validTargets, promptType, millEvents,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state(): GameState {
      return state;
    },
    set state(value: GameState) {
      state = value;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

const EVENT_TEXT: Record<string, string> = {
  "EB01-051": "[Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.",
  "EB04-049": "[Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
  "OP04-055": "[Main] You may trash 1 [Ice Oni] from your hand and place 1 Character with a cost of 4 or less at the bottom of the owner's deck: Play 1 [Ice Oni] from your trash.",
};

function putEvent(f: Fixture, id: string, owner: 0 | 1 = 0, zone: CardInstance["zone"] = "HAND") {
  return f.put(id, owner, zone, {
    type: "Event",
    cost: 1,
    power: null,
    effectText: EVENT_TEXT[id],
    triggerText: "[Trigger] Activate this card's [Main] effect.",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
  });
}

function onField(state: GameState, instanceId: string): boolean {
  return state.players.some((p) => p.characters.some((c) => c?.instanceId === instanceId));
}

// ─── MILL cost: [Main] Events ────────────────────────────────────────────────

describe.each(["EB01-051", "EB04-049"])("OPT-798 %s — MILL is an activation cost", (id) => {
  it("with a 1-card deck the cost cannot be paid: nothing is trashed and nothing is K.O.'d", () => {
    const f = fixture();
    f.deck(0, 1);
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, id).instanceId });
    f.accept();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
    expect(f.state.players[0].deck).toHaveLength(1);
    expect(f.millEvents()).toHaveLength(0);
    expect(onField(f.state, victim.instanceId)).toBe(true);
  });

  it("with a 3-card deck pays 2 from the top, publishes one mill event, then K.O.s", () => {
    const f = fixture();
    f.deck(0, 3);
    const top2 = f.state.players[0].deck.slice(0, 2).map((c) => c.cardId);
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, id).instanceId });
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(1);
    expect(f.state.players[0].trash.map((c) => c.cardId)).toEqual(
      expect.arrayContaining(top2),
    );
    expect(f.validTargets()).toEqual([victim.instanceId]);
    f.roundTrip();
    f.select([victim.instanceId]);
    expect(onField(f.state, victim.instanceId)).toBe(false);
    expect(f.state.players[1].trash.some((c) => c.cardId === "victim")).toBe(true);
    // Published exactly once, with the MILL action's event shape.
    expect(f.millEvents()).toHaveLength(1);
    expect(f.millEvents()[0]).toMatchObject({ playerIndex: 0, payload: { count: 2, reason: "mill", from: "DECK" } });
  });

  it("an exactly-2-card deck can pay (deck ≥ amount) and the K.O. still resolves", () => {
    const f = fixture();
    f.deck(0, 2);
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, id).instanceId });
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(0);
    expect(f.validTargets()).toEqual([victim.instanceId]);
  });

  it("declining the optional cost trashes nothing and K.O.s nothing", () => {
    const f = fixture();
    f.deck(0, 5);
    const victim = f.put("victim", 1, "CHARACTER", { cost: 2 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, id).instanceId });
    f.decline();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].deck).toHaveLength(5);
    expect(f.millEvents()).toHaveLength(0);
    expect(onField(f.state, victim.instanceId)).toBe(true);
  });

  it("[Trigger] reuse enters the same resolveEffect path — the MILL cost gates it identically", () => {
    // REUSE_EFFECT (actions/choice.ts) calls resolveEffect on the [Main]
    // block with the Trigger card as source; drive that exact call.
    for (const [deckSize, paid] of [[1, false], [4, true]] as const) {
      const f = fixture();
      f.deck(1, deckSize);
      const victim = f.put("victim", 0, "CHARACTER", { cost: 2 });
      const source = putEvent(f, id, 1, "TRASH");
      const main = f.db.get(id)!.effectSchema!.effects.find(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "MAIN_EVENT",
      )!;
      const reused = resolveEffect(f.state, main, source.instanceId, 1, f.db);
      expect(reused.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      f.state = { ...reused.state, pendingPrompt: reused.pendingPrompt! };
      f.accept();
      if (!paid) {
        expect(f.state.pendingPrompt).toBeNull();
        expect(f.state.effectStack).toHaveLength(0);
        expect(f.state.players[1].deck).toHaveLength(deckSize);
        expect(onField(f.state, victim.instanceId)).toBe(true);
      } else {
        expect(f.state.players[1].deck).toHaveLength(deckSize - 2);
        expect(f.validTargets()).toEqual([victim.instanceId]);
        f.select([victim.instanceId]);
        expect(onField(f.state, victim.instanceId)).toBe(false);
      }
    }
  });

  // Pre-existing, out of OPT-798 scope: executeReuseEffect drops the reused
  // block's pendingPrompt (it returns only `succeeded`), so a Life [Trigger]
  // that reuses any prompting [Main] leaves an orphan frame and never asks.
  // Reported as a follow-up; this ratchet fails loudly once that is fixed.
  it.fails("[Trigger] via Life damage offers the reused [Main]'s optional prompt", () => {
    const f = fixture();
    f.deck(1, 4);
    f.put("victim", 0, "CHARACTER", { cost: 2 });
    f.state.players[1].life = [];
    putEvent(f, id, 1, "LIFE");
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: f.state.players[1].leader.instanceId,
    });
    f.act({ type: "PASS" });
    f.act({ type: "PASS" });
    f.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
  });
});

// ─── MILL cost: auto effects ─────────────────────────────────────────────────

function lucciAttack(f: Fixture) {
  f.put("OP07-079", 0, "LEADER", { type: "Leader", cost: null, power: 5000, life: 5 });
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: f.state.players[0].leader.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
}

describe("OPT-798 OP07-079 Rob Lucci [When Attacking] MILL cost", () => {
  it("unpayable (1-card deck): accepting pays nothing and resolves no cost reduction", () => {
    const f = fixture();
    f.deck(0, 1);
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    lucciAttack(f);
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(1);
    expect(f.millEvents()).toHaveLength(0);
    expect(f.validTargets()).not.toContain(target.instanceId);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(3);
  });

  it("payable: trashes 2 from the top, then gives up to 1 opponent Character −1 cost", () => {
    const f = fixture();
    f.deck(0, 4);
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    lucciAttack(f);
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(2);
    expect(f.validTargets()).toEqual([target.instanceId]);
    f.select([target.instanceId]);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(2);
    expect(f.millEvents()).toHaveLength(1);
  });

  it("declined: nothing is trashed", () => {
    const f = fixture();
    f.deck(0, 4);
    f.put("target", 1, "CHARACTER", { cost: 3 });
    lucciAttack(f);
    f.decline();
    expect(f.state.players[0].deck).toHaveLength(4);
    expect(f.millEvents()).toHaveLength(0);
  });
});

describe("OPT-798 EB04-042 Alpha [On Play] MILL cost", () => {
  it("unpayable (2-card deck for a 3-card cost): nothing trashed, no −1 cost", () => {
    const f = fixture();
    f.deck(0, 2);
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    f.act({ type: "PLAY_CARD", cardInstanceId: f.put("EB04-042", 0, "HAND", { cost: 2 }).instanceId });
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(2);
    expect(f.millEvents()).toHaveLength(0);
    expect(f.validTargets()).not.toContain(target.instanceId);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(3);
  });

  it("payable: trashes 3, then −1 cost", () => {
    const f = fixture();
    f.deck(0, 3);
    const target = f.put("target", 1, "CHARACTER", { cost: 3 });
    f.act({ type: "PLAY_CARD", cardInstanceId: f.put("EB04-042", 0, "HAND", { cost: 2 }).instanceId });
    f.accept();
    expect(f.state.players[0].deck).toHaveLength(0);
    f.select([target.instanceId]);
    expect(getEffectiveCost(f.db.get("target")!, f.state, target.instanceId, f.db)).toBe(2);
    expect(f.millEvents()).toHaveLength(1);
    expect(f.millEvents()[0].payload).toMatchObject({ count: 3 });
  });
});

describe("OPT-798 OP15-088 Pirates Docking Six", () => {
  function setup(deckSize: number) {
    const f = fixture();
    f.deck(0, deckSize);
    const hand = [f.put("keep-a", 0, "HAND"), f.put("keep-b", 0, "HAND"), f.put("keep-c", 0, "HAND")];
    // Printed cost 1 (+6 from its own permanent effect) fits the 8 test DON!!.
    const docking = f.put("OP15-088", 0, "HAND", { cost: 1, power: 7000 });
    return { f, hand, docking };
  }

  it("pays only the MILL cost — no hand discard — and may play a Straw Hat it trashed (FAQ)", () => {
    const { f } = setup(3);
    const shc = f.put("shc-2", 0, "DECK", { cost: 2, types: ["Straw Hat Crew"] });
    f.act({ type: "PLAY_CARD", cardInstanceId: f.state.players[0].hand.at(-1)!.instanceId });
    f.accept();
    expect(f.state.players[0].hand).toHaveLength(3);
    expect(f.state.players[0].deck).toHaveLength(1);
    const trashed = f.state.players[0].trash.find((c) => c.cardId === shc.cardId)!;
    expect(f.validTargets()).toEqual([trashed.instanceId]);
    f.select([trashed.instanceId]);
    expect(f.state.players[0].characters.some((c) => c?.cardId === "shc-2")).toBe(true);
    expect(f.state.players[0].hand).toHaveLength(3);
    expect(f.millEvents()).toHaveLength(1);
  });

  it("with a 2-card deck nothing is trashed and nothing is played from the trash", () => {
    const { f } = setup(2);
    f.put("shc-in-trash", 0, "TRASH", { cost: 2, types: ["Straw Hat Crew"] });
    f.act({ type: "PLAY_CARD", cardInstanceId: f.state.players[0].hand.at(-1)!.instanceId });
    f.accept();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand).toHaveLength(3);
    expect(f.state.players[0].deck).toHaveLength(2);
    expect(f.millEvents()).toHaveLength(0);
    expect(f.state.players[0].characters.some((c) => c?.cardId === "shc-in-trash")).toBe(false);
  });
});

// ─── Either-player Character-to-owner's-deck cost ───────────────────────────

describe("OPT-798 OP06-043 Aramaki — place 1 Character (either player's) at the owner's deck bottom", () => {
  function setup() {
    const f = fixture();
    const aramaki = f.put("OP06-043", 0, "CHARACTER", { cost: 5, power: 7000 });
    const discard = f.put("discard", 0, "HAND");
    return { f, aramaki, discard };
  }
  function activate(f: Fixture, aramaki: CardInstance) {
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: aramaki.instanceId, effectId: "OP06-043_effect_1" });
    f.accept();
  }

  it("bottom-decks the opponent's cost-2 Character into the OPPONENT's deck; excludes cost 3", () => {
    const { f, aramaki, discard } = setup();
    const opp2 = f.put("opp-cost-2", 1, "CHARACTER", { cost: 2 });
    f.state.players[1].characters = f.state.players[1].characters.map((c) =>
      c?.instanceId === opp2.instanceId
        ? { ...c, attachedDon: [{ instanceId: "opp-don", state: "ACTIVE", attachedTo: opp2.instanceId }] }
        : c,
    );
    f.state.players[1].donCostArea = f.state.players[1].donCostArea.filter((d) => d.instanceId !== "opp-don");
    const opp3 = f.put("opp-cost-3", 1, "CHARACTER", { cost: 3 });
    const own3 = f.put("own-cost-3", 0, "CHARACTER", { cost: 3 });
    const oppDeck = f.state.players[1].deck.length;
    const ownDeck = f.state.players[0].deck.length;
    activate(f, aramaki);
    // Printed order: the hand trash is paid first (rule 8-3-1-1).
    expect(f.validTargets()).toEqual([discard.instanceId]);
    f.select([discard.instanceId]);
    expect(f.validTargets()).toEqual([opp2.instanceId]);
    expect(f.validTargets()).not.toContain(opp3.instanceId);
    expect(f.validTargets()).not.toContain(own3.instanceId);
    f.roundTrip();
    f.select([opp2.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(onField(f.state, opp2.instanceId)).toBe(false);
    expect(f.state.players[1].deck).toHaveLength(oppDeck + 1);
    const bottom = f.state.players[1].deck.at(-1)!;
    expect(bottom).toMatchObject({ cardId: "opp-cost-2", owner: 1, zone: "DECK" });
    expect(bottom.instanceId).not.toBe(opp2.instanceId);
    expect(f.state.players[0].deck).toHaveLength(ownDeck);
    // Attached DON!! returns to its owner's cost area rested.
    expect(f.state.players[1].donCostArea.find((d) => d.instanceId === "opp-don")).toMatchObject({
      state: "RESTED",
      attachedTo: null,
    });
    const returned = f.state.eventLog.filter((e) => e.type === "CARD_RETURNED_TO_DECK");
    expect(returned).toHaveLength(1);
    expect(returned[0]).toMatchObject({
      playerIndex: 1,
      payload: { cardInstanceId: opp2.instanceId, sourceController: 1, causingController: 0, movementCause: "COST" },
    });
    const power = f.state.activeEffects.some((e) => e.sourceCardInstanceId === aramaki.instanceId);
    expect(power).toBe(true);
  });

  it("may bottom-deck your own cost-2 Character into your deck", () => {
    const { f, aramaki, discard } = setup();
    const own2 = f.put("own-cost-2", 0, "CHARACTER", { cost: 2 });
    const ownDeck = f.state.players[0].deck.length;
    activate(f, aramaki);
    f.select([discard.instanceId]);
    expect(f.validTargets()).toEqual([own2.instanceId]);
    f.select([own2.instanceId]);
    expect(f.state.players[0].deck).toHaveLength(ownDeck + 1);
    expect(f.state.players[0].deck.at(-1)).toMatchObject({ cardId: "own-cost-2", owner: 0 });
  });

  it("reads the effective cost: a cost-3 opponent Character under −1 cost is eligible", () => {
    const { f, aramaki, discard } = setup();
    const kalifa = f.put("OP07-081", 0, "CHARACTER", { cost: 2 });
    f.state.players[0].characters = f.state.players[0].characters.map((c) =>
      c?.instanceId === kalifa.instanceId
        ? { ...c, attachedDon: [{ instanceId: "kalifa-don", state: "ACTIVE", attachedTo: kalifa.instanceId }] }
        : c,
    );
    const opp3 = f.put("opp-cost-3", 1, "CHARACTER", { cost: 3 });
    expect(getEffectiveCost(f.db.get("opp-cost-3")!, f.state, opp3.instanceId, f.db)).toBe(2);
    activate(f, aramaki);
    f.select([discard.instanceId]);
    // Kalifa herself is cost 2 as well — both players' eligible Characters are offered.
    expect(f.validTargets().sort()).toEqual([kalifa.instanceId, opp3.instanceId].sort());
  });

  it("is unavailable when no Character on either field has cost ≤2 (qa_op06.md:118-122)", () => {
    const { f, aramaki } = setup();
    f.put("opp-cost-3", 1, "CHARACTER", { cost: 3 });
    f.put("own-cost-3", 0, "CHARACTER", { cost: 3 });
    const entry = computeEffectAvailability(f.state, f.db)[aramaki.instanceId]
      ?.find((e) => e.effectId === "OP06-043_effect_1");
    expect(entry).toMatchObject({ status: "blocked", reason: "COST" });
    const r = runPipeline(
      f.state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: aramaki.instanceId, effectId: "OP06-043_effect_1" },
      f.db,
      0,
    );
    expect(r.valid).toBe(false);
  });

  it("skips an opponent Character protected from removal by its opponent's effects", () => {
    const { f, aramaki, discard } = setup();
    const shielded = f.put("opp-shielded", 1, "CHARACTER", { cost: 1 });
    const open = f.put("opp-open", 1, "CHARACTER", { cost: 1 });
    f.state.prohibitions = [{
      id: "shield",
      sourceCardInstanceId: shielded.instanceId,
      sourceEffectBlockId: "shield-block",
      prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
      controller: 1,
      appliesTo: [shielded.instanceId],
      scope: {},
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      usesRemaining: null,
      conditionalOverride: null,
      timestamp: 0,
    } as unknown as GameState["prohibitions"][number]];
    activate(f, aramaki);
    f.select([discard.instanceId]);
    expect(f.validTargets()).toEqual([open.instanceId]);
  });

  it("an opponent Character alone makes the effect available", () => {
    const { f, aramaki } = setup();
    f.put("opp-cost-2", 1, "CHARACTER", { cost: 2 });
    const entry = computeEffectAvailability(f.state, f.db)[aramaki.instanceId]
      ?.find((e) => e.effectId === "OP06-043_effect_1");
    expect(entry).toMatchObject({ status: "usable" });
  });

  it("a stale duplicate of the placement response cannot pay twice", () => {
    const { f, aramaki, discard } = setup();
    const oppA = f.put("opp-a", 1, "CHARACTER", { cost: 1 });
    const oppB = f.put("opp-b", 1, "CHARACTER", { cost: 1 });
    const oppDeck = f.state.players[1].deck.length;
    activate(f, aramaki);
    f.select([discard.instanceId]);
    const response: GameAction = { type: "SELECT_TARGET", selectedInstanceIds: [oppA.instanceId] };
    const staleResponse: GameAction = { type: "SELECT_TARGET", selectedInstanceIds: [oppB.instanceId] };
    expect(f.respond(response)).toBe(false);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.respond(staleResponse)).toBe(true);
    expect(onField(f.state, oppB.instanceId)).toBe(true);
    expect(f.state.players[1].deck).toHaveLength(oppDeck + 1);
  });
});

describe("OPT-798 MILL cost availability reads (isCostPayable)", () => {
  const millActivate = {
    card_id: "SYN-MILL",
    card_type: "Character",
    effects: [{
      id: "mill_draw",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "MILL", amount: 2 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }],
  } as unknown as CardData["effectSchema"];

  it.each([[1, "blocked"], [2, "usable"]] as const)("deck of %i → %s", (size, status) => {
    const f = fixture();
    f.deck(0, size);
    const source = f.put("SYN-MILL", 0, "CHARACTER", { effectSchema: millActivate });
    const entry = computeEffectAvailability(f.state, f.db)[source.instanceId]?.find((e) => e.effectId === "mill_draw");
    expect(entry?.status).toBe(status);
    const r = runPipeline(f.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "mill_draw" }, f.db, 0);
    expect(r.valid).toBe(status === "usable");
  });
});

describe("OPT-798 OP04-055 Plague Rounds — both costs in printed order", () => {
  function setup() {
    const f = fixture();
    const oni = f.put("ICE-ONI", 0, "HAND", { name: "Ice Oni", cost: 5 });
    f.put("oni-in-trash", 0, "TRASH", { name: "Ice Oni", cost: 5 });
    return { f, oni };
  }

  it("trashes [Ice Oni] first, then bottom-decks an opponent cost ≤4 Character, then plays Ice Oni", () => {
    const { f, oni } = setup();
    const opp4 = f.put("opp-cost-4", 1, "CHARACTER", { cost: 4 });
    const opp5 = f.put("opp-cost-5", 1, "CHARACTER", { cost: 5 });
    const oppDeck = f.state.players[1].deck.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, "OP04-055").instanceId });
    f.accept();
    expect(f.validTargets()).toEqual([oni.instanceId]);
    f.select([oni.instanceId]);
    expect(f.validTargets()).toEqual([opp4.instanceId]);
    expect(f.validTargets()).not.toContain(opp5.instanceId);
    f.select([opp4.instanceId]);
    expect(f.state.players[1].deck).toHaveLength(oppDeck + 1);
    expect(f.state.players[1].deck.at(-1)).toMatchObject({ cardId: "opp-cost-4", owner: 1 });
    if (f.promptType() === "SELECT_TARGET") f.select([f.validTargets()[0]]);
    expect(
      f.state.players[0].characters.filter((c) => f.db.get(c?.cardId ?? "")?.name === "Ice Oni"),
    ).toHaveLength(1);
  });

  it("is not payable without a cost ≤4 Character on either field — the Ice Oni stays in hand", () => {
    const { f, oni } = setup();
    f.put("opp-cost-5", 1, "CHARACTER", { cost: 5 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, "OP04-055").instanceId });
    f.accept();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].hand.map((c) => c.instanceId)).toContain(oni.instanceId);
    expect(f.state.players[0].characters.every((c) => c === null)).toBe(true);
  });

  it("is not payable without an [Ice Oni] in hand even when a Character could be placed", () => {
    const f = fixture();
    f.put("oni-in-trash", 0, "TRASH", { name: "Ice Oni", cost: 5 });
    const opp4 = f.put("opp-cost-4", 1, "CHARACTER", { cost: 4 });
    f.act({ type: "PLAY_CARD", cardInstanceId: putEvent(f, "OP04-055").instanceId });
    f.accept();
    expect(f.state.pendingPrompt).toBeNull();
    expect(onField(f.state, opp4.instanceId)).toBe(true);
  });
});
