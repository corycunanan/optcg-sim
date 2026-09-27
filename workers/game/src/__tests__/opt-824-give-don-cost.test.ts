import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectBlock, RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { applyCostSelection } from "../engine/effect-resolver/cost/resume.js";
import { isCostPayable } from "../engine/effect-resolver/cost/payability.js";
import { validateCost } from "../engine/schema-registry.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Printed costs (canonical docs/cards text):
// - OP13-007 (OP-13.md:51): "[Activate: Main] You may give 1 of your active
//   DON!! cards to 1 of your Leader or Character cards and trash this
//   Character: Give up to 1 of your opponent's Characters −3000 power during
//   this turn."
// - EB04-009 (EB-04.md:66): "[Main] You may give 1 active DON!! card to 1 of
//   your [Silvers Rayleigh]: Give up to 1 of your opponent's Characters −2000
//   power during this turn."
// - OP12-016 (OP-12.md:88): "[Main] You may give 2 active DON!! cards to 1 of
//   your [Silvers Rayleigh]: Your opponent cannot activate [Blocker] when the
//   card given these DON!! cards attacks during this turn."
// - OP12-017 (OP-12.md:96) / OP12-019 (OP-12.md:110): "[Main] You may give 1
//   active DON!! card to 1 of your [Silvers Rayleigh]: ..."
// Rules: 6-5-5-1 (giving places 1 ACTIVE DON!! from the cost area under your
// Leader or Character), 4-4-2 (given DON!! are neither active nor rested),
// 6-5-5-4 (a card leaving the area returns its given DON!! to the cost area
// rested), 8-3-1-1 (costs in printed order), 8-3-1-3 (unpayable → pay none),
// 8-3-1-4 (declined "may" cost → no effect), 8-3-1-7 (replaced cost → no
// effect). FAQ qa_op12.md:68-115: OP12-016 needs 2 active DON!!, OP12-017/019
// need 1; none activate without a [Silvers Rayleigh]; a Rayleigh Character is
// a legal recipient. OP12-001 is a [Silvers Rayleigh] Leader (OP-12.md:3).

const P0 = 0 as const;
const P1 = 1 as const;

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER",
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt824-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "CHARACTER") {
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
    return card;
  }
  function act(action: GameAction, player: 0 | 1 = P0) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function tryAct(action: GameAction, player: 0 | 1 = P0) {
    const result = runPipeline(state, action, db, player);
    if (result.valid) state = result.state;
    return result;
  }
  function respond(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt?.options }),
    ).toBe(rejected);
    state = result.state;
  }
  const accept = () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => respond({ type: "PLAYER_CHOICE", choiceId: "skip" });
  const select = (ids: string[], rejected = false) =>
    respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected);
  return {
    db,
    data,
    put,
    act,
    tryAct,
    respond,
    accept,
    decline,
    select,
    persist() {
      state = parseStoredSession(
        JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
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

function activeCostDon(f: Fixture, player: 0 | 1 = P0) {
  return f.state.players[player].donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo).length;
}
function restedCostDon(f: Fixture, player: 0 | 1 = P0) {
  return f.state.players[player].donCostArea.filter((d) => d.state === "RESTED").length;
}
function totalDon(f: Fixture, player: 0 | 1) {
  const p = f.state.players[player];
  return p.donCostArea.length + p.leader.attachedDon.length +
    p.characters.reduce((n, c) => n + (c?.attachedDon.length ?? 0), 0);
}
function donGivenEvents(f: Fixture) {
  return f.state.eventLog.filter((e) => e.type === "DON_GIVEN_TO_CARD");
}
function setDon(f: Fixture, player: 0 | 1, active: number, rested = 0) {
  const p = f.state.players[player];
  const pool = [...p.donCostArea, ...p.donDeck];
  p.donCostArea = pool.slice(0, active + rested).map((d, i) => ({
    ...d,
    state: i < active ? "ACTIVE" as const : "RESTED" as const,
    attachedTo: null,
  }));
  p.donDeck = pool.slice(active + rested);
}
function prompt(f: Fixture) {
  return f.state.pendingPrompt?.options;
}
function selectPrompt(f: Fixture) {
  const options = prompt(f);
  expect(options?.promptType).toBe("SELECT_TARGET");
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options;
}
function power(f: Fixture, card: CardInstance) {
  const live = f.state.players[card.controller].characters.find((c) => c?.instanceId === card.instanceId)!;
  return getEffectivePower(live, f.db.get(card.cardId)!, f.state, f.db);
}

// ─── OP13-007 Ace & Sabo & Luffy ─────────────────────────────────────────────

function setupAsl(opts: { active?: number; rested?: number } = {}) {
  const f = fixture();
  f.data("OP13-007", { cost: 5, power: 6000 });
  const asl = f.put("OP13-007", P0);
  const ally = f.put(CARDS.VANILLA.id, P0);
  const foe = f.put(CARDS.VANILLA.id, P1);
  setDon(f, P0, opts.active ?? 3, opts.rested ?? 0);
  return { f, asl, ally, foe };
}

function activateAsl(f: Fixture, asl: CardInstance) {
  f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: asl.instanceId, effectId: "OP13-007_activate_main" });
}

describe("OPT-824 GIVE_DON cost — OP13-007", () => {
  it("gives 1 active DON!! to the chosen Leader, trashes itself, then resolves −3000", () => {
    const { f, asl, ally, foe } = setupAsl();
    const leader = f.state.players[P0].leader;
    const before = power(f, foe);
    activateAsl(f, asl);
    f.accept();
    const recipient = selectPrompt(f);
    expect(recipient.countMin).toBe(1);
    expect(recipient.countMax).toBe(1);
    expect(new Set(recipient.validTargets)).toEqual(
      new Set([leader.instanceId, asl.instanceId, ally.instanceId]),
    );
    // Nothing is committed while the recipient prompt is pending.
    expect(activeCostDon(f)).toBe(3);
    f.select([leader.instanceId]);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(1);
    expect(activeCostDon(f)).toBe(2);
    expect(f.state.players[P0].characters.some((c) => c?.instanceId === asl.instanceId)).toBe(false);
    expect(f.state.players[P0].trash.some((c) => c.cardId === "OP13-007")).toBe(true);
    f.select([foe.instanceId]);
    expect(power(f, foe)).toBe(before - 3000);
    expect(donGivenEvents(f)).toHaveLength(1);
    expect(donGivenEvents(f)[0]).toMatchObject({
      playerIndex: P0,
      payload: { targetInstanceId: leader.instanceId, count: 1 },
    });
    expect(totalDon(f, P1)).toBe(6);
  });

  it("may give the DON!! to itself; trashing it returns that DON!! to the cost area rested (6-5-5-4)", () => {
    const { f, asl, foe } = setupAsl();
    activateAsl(f, asl);
    f.accept();
    f.select([asl.instanceId]);
    expect(activeCostDon(f)).toBe(2);
    expect(restedCostDon(f)).toBe(1);
    expect(f.state.players[P0].donCostArea).toHaveLength(3);
    expect(f.state.players[P0].trash.some((c) => c.cardId === "OP13-007")).toBe(true);
    f.select([foe.instanceId]);
    expect(donGivenEvents(f)).toHaveLength(1);
  });

  it("is unavailable with only rested or given DON!! (only active cost-area DON!! count)", () => {
    const { f, asl, ally } = setupAsl({ active: 0, rested: 3 });
    const donId = f.state.players[P0].donCostArea[0].instanceId;
    // A DON!! already given to a Character is not an active cost-area DON!!.
    const p = f.state.players[P0];
    p.donCostArea = p.donCostArea.slice(1);
    p.characters = p.characters.map((c) =>
      c?.instanceId === ally.instanceId
        ? { ...c, attachedDon: [{ instanceId: donId, state: "ACTIVE", attachedTo: ally.instanceId }] }
        : c);
    const before = structuredClone(f.state);
    const result = f.tryAct({ type: "ACTIVATE_EFFECT", cardInstanceId: asl.instanceId, effectId: "OP13-007_activate_main" });
    expect(result.valid).toBe(false);
    expect(f.state).toEqual(before);
  });

  it("declining the optional cost moves nothing and resolves nothing (8-3-1-4)", () => {
    const { f, asl, foe } = setupAsl();
    const before = power(f, foe);
    activateAsl(f, asl);
    f.decline();
    expect(f.state.pendingPrompt).toBeNull();
    expect(activeCostDon(f)).toBe(3);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(0);
    expect(f.state.players[P0].characters.some((c) => c?.instanceId === asl.instanceId)).toBe(true);
    expect(power(f, foe)).toBe(before);
    expect(donGivenEvents(f)).toHaveLength(0);
  });

  function withLeaveFieldReplacement(f: Fixture, asl: CardInstance) {
    const replacement: RuntimeActiveEffect = {
      id: "opt824-leave-replacement",
      sourceCardInstanceId: asl.instanceId,
      sourceEffectBlockId: "leave-field",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_LEAVE_FIELD",
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_LIFE", params: { amount: 1, position: "TOP" } }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: P0,
      appliesTo: [asl.instanceId],
      timestamp: 1,
    } as unknown as RuntimeActiveEffect;
    f.state = { ...f.state, activeEffects: [...f.state.activeEffects, replacement as never] };
  }

  it("rolls back the given DON!! when the later trash-this-Character cost is replaced (8-3-1-7)", () => {
    const { f, asl, foe } = setupAsl();
    withLeaveFieldReplacement(f, asl);
    const leader = f.state.players[P0].leader;
    const before = power(f, foe);
    activateAsl(f, asl);
    f.accept();
    f.select([leader.instanceId]);
    // The replacement offer for the trash cost is pending; the give is staged only.
    expect(prompt(f)?.promptType).toBe("OPTIONAL_EFFECT");
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(0);
    expect(activeCostDon(f)).toBe(3);
    f.persist();
    f.accept();
    expect(f.state.players[P0].characters.some((c) => c?.instanceId === asl.instanceId)).toBe(true);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(0);
    expect(activeCostDon(f)).toBe(3);
    expect(power(f, foe)).toBe(before);
    expect(donGivenEvents(f)).toHaveLength(0);
  });

  it("commits the give exactly once when the trash cost's replacement is declined", () => {
    const { f, asl, foe } = setupAsl();
    withLeaveFieldReplacement(f, asl);
    const leader = f.state.players[P0].leader;
    const before = power(f, foe);
    activateAsl(f, asl);
    f.accept();
    f.select([leader.instanceId]);
    f.persist();
    f.decline();
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(1);
    expect(f.state.players[P0].characters.some((c) => c?.instanceId === asl.instanceId)).toBe(false);
    f.select([foe.instanceId]);
    expect(power(f, foe)).toBe(before - 3000);
    expect(donGivenEvents(f)).toHaveLength(1);
  });

  it("round-trips the recipient prompt through persistence and rejects stale or duplicate replies", () => {
    const { f, asl, ally, foe } = setupAsl();
    activateAsl(f, asl);
    f.accept();
    f.persist();
    const pending = structuredClone(f.state);
    // Malformed replies leave the prompt and continuation untouched.
    for (const ids of [[], [ally.instanceId, asl.instanceId], [foe.instanceId], ["foreign"]]) {
      f.select(ids, true);
      expect(f.state).toEqual(pending);
    }
    f.persist();
    f.select([ally.instanceId]);
    expect(f.state.players[P0].characters.find((c) => c?.instanceId === ally.instanceId)!.attachedDon)
      .toHaveLength(1);
    // The recipient prompt is consumed; replaying it cannot pay again.
    const afterPay = structuredClone(f.state);
    f.persist();
    expect(selectPrompt(f).validTargets).not.toContain(ally.instanceId);
    f.select([ally.instanceId], true);
    expect(f.state).toEqual(JSON.parse(JSON.stringify(afterPay)));
    f.select([foe.instanceId]);
    expect(donGivenEvents(f)).toHaveLength(1);
    expect(activeCostDon(f)).toBe(2);
  });
});

// ─── Silvers Rayleigh Events: EB04-009, OP12-016, OP12-017, OP12-019 ────────

const EVENT_TEXT: Record<string, string> = {
  "EB04-009": "[Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]: Give up to 1 of your opponent's Characters −2000 power during this turn.",
  "OP12-016": "[Main] You may give 2 active DON!! cards to 1 of your [Silvers Rayleigh]: Your opponent cannot activate [Blocker] when the card given these DON!! cards attacks during this turn.",
  "OP12-017": "[Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]: Look at 4 cards from the top of your deck; reveal up to 1 red Event or up to 1 Character card with a cost of 3 or more and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
  "OP12-019": "[Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]: Up to 1 of your Leader or Character cards gains +1000 power during this turn.",
};

function setupRayleigh(eventId: string, opts: {
  active?: number;
  rayleigh?: "LEADER" | "CHARACTER" | "BOTH" | "NONE";
} = {}) {
  const f = fixture();
  f.data("OP12-001", { type: "Leader", name: "Silvers Rayleigh", cost: 0, power: 5000, color: ["Red"] });
  f.data("OP09-005", { name: "Silvers Rayleigh", cost: 5, power: 6000, effectSchema: null });
  f.data(eventId, { type: "Event", cost: 0, power: null, counter: null, effectText: EVENT_TEXT[eventId] });
  const where = opts.rayleigh ?? "CHARACTER";
  const leader = where === "LEADER" || where === "BOTH" ? f.put("OP12-001", P0, "LEADER") : f.state.players[P0].leader;
  const rayleighChar = where === "CHARACTER" || where === "BOTH" ? f.put("OP09-005", P0) : null;
  const ally = f.put(CARDS.VANILLA.id, P0);
  const foe = f.put(CARDS.VANILLA.id, P1);
  const event = f.put(eventId, P0, "HAND");
  setDon(f, P0, opts.active ?? 3);
  return { f, leader, rayleighChar, ally, foe, event };
}

function play(f: Fixture, card: CardInstance) {
  f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
}

describe("OPT-824 GIVE_DON cost — Silvers Rayleigh Events", () => {
  it("EB04-009 gives 1 active DON!! to a Rayleigh Character, then gives −2000", () => {
    const { f, rayleighChar, ally, foe, event } = setupRayleigh("EB04-009");
    const before = power(f, foe);
    play(f, event);
    f.accept();
    const recipients = selectPrompt(f);
    expect(recipients.validTargets).toEqual([rayleighChar!.instanceId]);
    expect(recipients.validTargets).not.toContain(ally.instanceId);
    f.select([rayleighChar!.instanceId]);
    expect(f.state.players[P0].characters.find((c) => c?.instanceId === rayleighChar!.instanceId)!.attachedDon)
      .toHaveLength(1);
    f.select([foe.instanceId]);
    expect(power(f, foe)).toBe(before - 2000);
    expect(activeCostDon(f)).toBe(2);
    expect(donGivenEvents(f)).toHaveLength(1);
  });

  it("EB04-009 accepts the [Silvers Rayleigh] Leader as recipient", () => {
    const { f, leader, foe, event } = setupRayleigh("EB04-009", { rayleigh: "LEADER" });
    play(f, event);
    f.accept();
    expect(selectPrompt(f).validTargets).toEqual([leader.instanceId]);
    f.select([leader.instanceId]);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(1);
    f.select([foe.instanceId]);
    expect(donGivenEvents(f)).toHaveLength(1);
  });

  for (const eventId of ["EB04-009", "OP12-016", "OP12-017", "OP12-019"]) {
    // The engine offers an optional block before checking its cost (shared
    // with OPT-798's MILL cost); accepting an unpayable cost pays and resolves
    // nothing — no recipient prompt, no DON!! moved (8-3-1-3).
    it(`${eventId} is unavailable without a [Silvers Rayleigh] recipient`, () => {
      const { f, event } = setupRayleigh(eventId, { rayleigh: "NONE" });
      play(f, event);
      f.accept();
      expect(f.state.pendingPrompt).toBeNull();
      expect(activeCostDon(f)).toBe(3);
      expect(donGivenEvents(f)).toHaveLength(0);
      expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ACTIVATE_BLOCKER")).toBe(false);
    });

    it(`${eventId} is unavailable without enough active DON!!`, () => {
      const need = eventId === "OP12-016" ? 2 : 1;
      const { f, event } = setupRayleigh(eventId, { active: need - 1 });
      // Rested DON!! never count toward a give.
      const p = f.state.players[P0];
      p.donCostArea = [...p.donCostArea, ...p.donDeck.slice(0, 3).map((d) => ({ ...d, state: "RESTED" as const, attachedTo: null }))];
      p.donDeck = p.donDeck.slice(3);
      play(f, event);
      f.accept();
      expect(f.state.pendingPrompt).toBeNull();
      expect(activeCostDon(f)).toBe(need - 1);
      expect(donGivenEvents(f)).toHaveLength(0);
    });
  }

  it("OP12-016 gives 2 active DON!! to one Rayleigh and never moves DON!! to the opponent", () => {
    const { f, leader, rayleighChar, event } = setupRayleigh("OP12-016", { rayleigh: "BOTH" });
    const opponentDon = structuredClone(f.state.players[P1].donCostArea);
    play(f, event);
    f.accept();
    expect(new Set(selectPrompt(f).validTargets)).toEqual(
      new Set([leader.instanceId, rayleighChar!.instanceId]),
    );
    f.select([rayleighChar!.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[P0].characters.find((c) => c?.instanceId === rayleighChar!.instanceId)!.attachedDon)
      .toHaveLength(2);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(0);
    expect(activeCostDon(f)).toBe(1);
    expect(f.state.players[P1].donCostArea).toEqual(opponentDon);
    expect(totalDon(f, P0)).toBe(3);
    expect(donGivenEvents(f)).toEqual([
      expect.objectContaining({
        playerIndex: P0,
        payload: expect.objectContaining({ targetInstanceId: rayleighChar!.instanceId, count: 2 }),
      }),
    ]);
    expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ACTIVATE_BLOCKER")).toBe(true);
  });

  it("OP12-017 gives 1 DON!! to Rayleigh (not the opponent) before looking at 4", () => {
    const { f, rayleighChar, event } = setupRayleigh("OP12-017");
    const opponentDon = structuredClone(f.state.players[P1].donCostArea);
    play(f, event);
    f.accept();
    f.select([rayleighChar!.instanceId]);
    expect(f.state.players[P0].characters.find((c) => c?.instanceId === rayleighChar!.instanceId)!.attachedDon)
      .toHaveLength(1);
    expect(f.state.players[P1].donCostArea).toEqual(opponentDon);
    expect(activeCostDon(f)).toBe(2);
    // The post-colon search runs after the cost is paid.
    const arrange = prompt(f);
    expect(arrange?.promptType).toBe("ARRANGE_TOP_CARDS");
    if (arrange?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("expected look-at-4");
    f.respond({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: arrange.cards.map((c) => c.instanceId),
      destination: "bottom",
    });
    expect(f.state.pendingPrompt).toBeNull();
    expect(donGivenEvents(f)).toHaveLength(1);
  });

  it("OP12-019 gives 1 DON!! to Rayleigh (not the opponent), then +1000", () => {
    const { f, rayleighChar, ally, event } = setupRayleigh("OP12-019");
    const opponentDon = structuredClone(f.state.players[P1].donCostArea);
    const before = power(f, ally);
    play(f, event);
    f.accept();
    f.select([rayleighChar!.instanceId]);
    expect(f.state.players[P1].donCostArea).toEqual(opponentDon);
    expect(totalDon(f, P1)).toBe(6);
    f.select([ally.instanceId]);
    expect(power(f, ally)).toBe(before + 1000);
    expect(activeCostDon(f)).toBe(2);
    expect(donGivenEvents(f)).toHaveLength(1);
  });

  it("the cost's DON!!-given event reaches a 'when given a DON!!' watcher exactly once", () => {
    // OP02-002 Garp: "[Your Turn] When this Leader or any of your Characters
    // is given a DON!! card, give up to 1 of your opponent's Characters with a
    // cost of 7 or less −1 cost during this turn."
    const { f, rayleighChar, event } = setupRayleigh("OP12-016");
    f.data("OP02-002", { type: "Leader", name: "Monkey.D.Garp", cost: 0, power: 5000 });
    f.put("OP02-002", P0, "LEADER");
    play(f, event);
    f.accept();
    f.select([rayleighChar!.instanceId]);
    expect(donGivenEvents(f)).toHaveLength(1);
    const garpPrompts = f.state.pendingPrompt ? 1 : 0;
    expect(garpPrompts).toBe(1);
    const foe = f.state.players[P1].characters.find(Boolean)!;
    f.select([foe.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    const costMods = f.state.activeEffects.filter((e) =>
      e.sourceCardInstanceId === f.state.players[P0].leader.instanceId);
    expect(costMods).toHaveLength(1);
  });
});

// ─── Feasibility and the __cost_don_given result ref ─────────────────────────

describe("OPT-824 GIVE_DON cost — engine contract", () => {
  it("exposes the recipient to post-colon actions as __cost_don_given", () => {
    const f = fixture();
    const ally = f.put(CARDS.VANILLA.id, P0);
    const other = f.put(CARDS.VANILLA.id, P0);
    const block: EffectBlock = {
      id: "opt824-ref",
      category: "activate",
      costs: [{
        type: "GIVE_DON",
        amount: 1,
        target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
      }],
      actions: [{
        type: "MODIFY_POWER",
        target: { type: "SELECTED_CARDS" },
        target_ref: "__cost_don_given",
        params: { amount: 5000 },
        duration: { type: "THIS_TURN" },
      }],
    };
    const prompted = resolveEffect(f.state, block, f.state.players[P0].leader.instanceId, P0, f.db);
    expect(prompted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const paid = resumeFromStack(prompted.state, { type: "SELECT_TARGET", selectedInstanceIds: [other.instanceId] }, f.db);
    f.state = paid.state;
    // +1000 from the given DON!! on its owner's turn (6-5-5-2), +5000 from the ref.
    expect(power(f, other)).toBe(4000 + 1000 + 5000);
    expect(power(f, ally)).toBe(4000);
  });

  it("keeps the recipient × suffix feasibility search proportional to the recipients", () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) f.put(CARDS.VANILLA.id, P0);
    setDon(f, P0, 10);
    // An unpayable suffix forces the search to visit every recipient once.
    const costs = [
      { type: "GIVE_DON" as const, amount: 1, target: { type: "LEADER_OR_CHARACTER" as const, controller: "SELF" as const, count: { exact: 1 } } },
      { type: "REST_DON" as const, amount: 10 },
    ];
    const started = performance.now();
    for (let i = 0; i < 200; i++) {
      expect(isCostSequencePayable(f.state, costs, P0, f.db, f.state.players[P0].leader.instanceId)).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(2000);
    expect(isCostSequencePayable(f.state, [costs[0], { type: "REST_DON", amount: 9 }], P0, f.db, f.state.players[P0].leader.instanceId))
      .toBe(true);
  });

  it("never gives the payer's DON!! to, or draws DON!! from, the opponent's side", () => {
    const f = fixture();
    const foe = f.put(CARDS.VANILLA.id, P1);
    const opponentDon = structuredClone(f.state.players[P1].donCostArea);
    const give = {
      type: "GIVE_DON" as const,
      amount: 1,
      target: { type: "CHARACTER" as const, controller: "OPPONENT" as const, count: { exact: 1 } },
    };
    // Even a mis-authored opponent recipient is never offered or applied.
    expect(isCostPayable(f.state, give, P0, f.db, f.state.players[P0].leader.instanceId)).toBe(false);
    const applied = applyCostSelection(f.state, give, [foe.instanceId], P0, f.db);
    expect(applied.events).toEqual([]);
    expect(applied.state.players[P1].donCostArea).toEqual(opponentDon);
    expect(applied.state.players[P1].characters.find((c) => c?.instanceId === foe.instanceId)!.attachedDon).toEqual([]);
  });

  it("validates the authored GIVE_DON cost shape", () => {
    const recipient = { type: "LEADER_OR_CHARACTER" as const, controller: "SELF" as const, count: { exact: 1 } };
    expect(validateCost({ type: "GIVE_DON", amount: 2, target: recipient }, "c", false)).toEqual([]);
    expect(validateCost({ type: "GIVE_DON", amount: 0, target: recipient }, "c", false)).toHaveLength(1);
    expect(validateCost({ type: "GIVE_DON", amount: 1 } as never, "c", false)).toHaveLength(1);
    expect(validateCost({ type: "GIVE_DON", amount: 1, target: { ...recipient, controller: "OPPONENT" } }, "c", false))
      .toHaveLength(1);
    expect(validateCost({ type: "GIVE_DON", amount: 1, target: { ...recipient, count: { up_to: 1 } } }, "c", false))
      .toHaveLength(1);
  });

  it("authors all five printed give-DON!! costs as GIVE_DON with their printed amounts", () => {
    const expected: Record<string, { amount: number; name?: string; costs: string[] }> = {
      "OP13-007": { amount: 1, costs: ["GIVE_DON", "TRASH_SELF"] },
      "EB04-009": { amount: 1, name: "Silvers Rayleigh", costs: ["GIVE_DON"] },
      "OP12-016": { amount: 2, name: "Silvers Rayleigh", costs: ["GIVE_DON"] },
      "OP12-017": { amount: 1, name: "Silvers Rayleigh", costs: ["GIVE_DON"] },
      "OP12-019": { amount: 1, name: "Silvers Rayleigh", costs: ["GIVE_DON"] },
    };
    for (const [id, want] of Object.entries(expected)) {
      const block = getEffectSchema(id)!.effects[0];
      expect(block.flags?.optional, id).toBe(true);
      expect(block.costs?.map((c) => c.type), id).toEqual(want.costs);
      const give = block.costs![0];
      if (give.type !== "GIVE_DON") throw new Error(id);
      expect(give.amount, id).toBe(want.amount);
      expect(give.target, id).toMatchObject({ type: "LEADER_OR_CHARACTER", controller: "SELF", count: { exact: 1 } });
      expect(give.target.filter?.name, id).toBe(want.name);
      expect(block.actions?.some((a) => a.type === "GIVE_DON"), id).toBe(false);
    }
  });
});
