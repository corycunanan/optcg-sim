/**
 * Timing baseline F3 / F4 (OPT-939 fixtures, README §2).
 *
 * F3: Rule 6-6-1-1 (line 607), 6-6-1-1-2 (line 611), 6-6-1-2 (line 617), 6-6-1-3 (line 622);
 *     FAQ qa_op10.md OP10-003 Sugar (End of Your Turn checks power before "during this turn" expires).
 * F13: ST13-002 text, rules 6-6-1-1 line 607, 6-6-1-1-2 line 611, 8-6-1 line 858; FAQ qa_st-13.md:13-15 (ST13-002 / OP12-099).
 * F14: rules 6-6-1-2 line 617, 6-6-1-3 line 622; FAQ qa_op10.md OP10-003 (scheduled-before-expiry, both players).
 * F4: OP15-022 text, rule 1-3-1 (line 57), 6-6-1-4 (line 624); FAQ faq_op15-eb04.md Brook.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../../types.js";
import type { EffectSchema, RuntimeActiveEffect, RuntimeScheduledAction } from "../../engine/effect-types.js";
import { runPipeline } from "../../engine/pipeline.js";
import { registerCardEnteredField, registerTriggersForCard } from "../../engine/triggers.js";
import { ST13_002_PORTGAS_D_ACE } from "../../engine/schemas/st13.js";
import { OP12_099_KALGARA } from "../../engine/schemas/op12.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

interface Built {
  state: GameState;
  cardDb: Map<string, CardData>;
}

function synCard(id: string, schema: EffectSchema | null, overrides: Partial<CardData> = {}): CardData {
  return { ...CARDS.VANILLA, id, name: id, effectSchema: schema, ...overrides };
}

function schema(id: string, type: "Character" | "Leader", effects: EffectSchema["effects"], extra: Partial<EffectSchema> = {}): EffectSchema {
  return { card_id: id, card_name: id, card_type: type, effects, ...extra };
}

let serial = 0;
function inst(cardId: string, controller: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return { instanceId: `${cardId}#${serial++}`, cardId, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller, owner: controller };
}

function base(cards: CardData[]): Built {
  const cardDb = new Map(createTestCardDb());
  for (const c of cards) cardDb.set(c.id, c);
  const state = createBattleReadyState(cardDb);
  const strip = (p: GameState["players"][0]): GameState["players"][0] => ({
    ...p,
    characters: padChars([]) as GameState["players"][0]["characters"],
    hand: [],
  });
  const players: GameState["players"] = [strip(state.players[0]), strip(state.players[1])];
  return { state: { ...state, players, eventLog: [] }, cardDb };
}

function placeChar(b: Built, card: CardInstance): CardInstance {
  const p = b.state.players[card.controller];
  p.characters[p.characters.findIndex((c) => !c)] = card;
  b.state = registerCardEnteredField(b.state, card, b.cardDb.get(card.cardId)!);
  return card;
}

function fillDecks(b: Built): void {
  for (const pi of [0, 1] as const) {
    b.state.players[pi].deck.push(inst(CARDS.VANILLA.id, pi, "DECK"), inst(CARDS.VANILLA.id, pi, "DECK"), inst(CARDS.VANILLA.id, pi, "DECK"));
  }
}

function run(b: Built, action: GameAction, player: 0 | 1 = 0): void {
  const r = runPipeline(b.state, action, b.cardDb, player);
  expect(r.valid, r.error).toBe(true);
  b.state = r.state;
}

/** THIS_TURN +1000 on `target`, anchored to the current turn, as MODIFY_POWER creates it. */
function thisTurnPlus1000(b: Built, target: CardInstance): RuntimeActiveEffect {
  return {
    id: `syn-this-turn-${target.instanceId}`,
    sourceCardInstanceId: target.instanceId,
    sourceEffectBlockId: "syn-power",
    category: "auto",
    modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: b.state.turn.number, player: 0 },
    controller: 0,
    appliesTo: [target.instanceId],
    timestamp: 1,
  };
}

const POWER_5000 = { type: "SELF_POWER", operator: ">=", value: 5000 } as const;

// ─── F3 ──────────────────────────────────────────────────────────────────────

describe("F3 End Phase: two waves, then expiry (rules 6-6-1-1 line 607, 6-6-1-1-2 line 611, 6-6-1-2 line 617, 6-6-1-3 line 622; FAQ qa_op10.md OP10-003)", () => {
  const EOYT = "SYN-EOYT"; // stands in for OP10-003 Sugar-style [End of Your Turn] power check
  const EOOT = "SYN-EOOT"; // an [End of Your Opponent's Turn] draw

  // Engine: runEndPhase has no waves, so neither END_OF_*_TURN draw resolves before TURN_ENDED.
  // Rule 6-6-1-1: all [End of Your Turn] effects, then all [End of Your Opponent's Turn] effects, then hand-off.
  it.fails("F3a wave 1 (ending player) resolves before wave 2, both before TURN_ENDED (ratchet OPT-962)", () => {
    const b = base([
      synCard(EOYT, schema(EOYT, "Character", [
        {
          id: "eoyt-draw",
          category: "auto",
          trigger: { keyword: "END_OF_YOUR_TURN" },
          conditions: POWER_5000,
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ])),
      synCard(EOOT, schema(EOOT, "Character", [
        {
          id: "eoot-draw",
          category: "auto",
          trigger: { keyword: "END_OF_OPPONENT_TURN" },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ])),
    ]);
    const eoyt = placeChar(b, inst(EOYT, 0, "CHARACTER"));
    placeChar(b, inst(EOOT, 1, "CHARACTER"));
    fillDecks(b);
    b.state = { ...b.state, activeEffects: [thisTurnPlus1000(b, eoyt)] };

    run(b, { type: "ADVANCE_PHASE" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    const before = log.slice(0, endedAt).filter((e) => e.startsWith("CARD_DRAWN"));
    expect(before).toEqual(["CARD_DRAWN:p0", "CARD_DRAWN:p1"]);
  });

  // Engine: runEndPhase expires THIS_TURN effects before processScheduledActions, so the conditional draw sees 4000 power.
  // Rules 6-6-1-2 / 6-6-1-3: scheduled end-of-turn effects resolve before "during this turn" modifiers expire.
  it.fails("F3b scheduled END_OF_THIS_TURN draw resolves before the THIS_TURN modifier expires (ratchet OPT-962)", () => {
    const b = base([]);
    const subject = placeChar(b, inst(CARDS.VANILLA.id, 0, "CHARACTER"));
    fillDecks(b);
    const modifier = thisTurnPlus1000(b, subject);
    const scheduled: RuntimeScheduledAction = {
      id: "syn-scheduled-draw",
      timing: "END_OF_THIS_TURN",
      action: { type: "DRAW", params: { amount: 1 }, conditions: POWER_5000 },
      boundToInstanceId: null,
      sourceEffectId: subject.instanceId,
      controller: 0,
    };
    b.state = { ...b.state, activeEffects: [modifier], scheduledActions: [scheduled] };

    run(b, { type: "ADVANCE_PHASE" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    expect(log).toContain("CARD_DRAWN:p0");
    expect(log.indexOf("CARD_DRAWN:p0")).toBeLessThan(log.indexOf("TURN_ENDED:p0"));
    expect(b.state.activeEffects.some((e) => e.id === modifier.id)).toBe(false);
  });
});

// ─── F4 ──────────────────────────────────────────────────────────────────────

describe("F4 Brook delayed deck-out loses at the end-of-turn boundary (OP15-022 text; rules 1-3-1 line 57, 6-6-1-4 line 624; FAQ faq_op15-eb04.md Brook)", () => {
  const BROOK_SCHEMA: EffectSchema = schema("OP15-022", "Leader", [], {
    rule_modifications: [
      { rule_type: "LOSS_CONDITION_MOD", trigger_event: "DECK_OUT", modification: "DELAYED_LOSS", delay: { timing: "END_OF_TURN" } },
    ],
  });
  const MILLER = "SYN-MILLER"; // [Activate: Main] trash 2 from the top of your deck, then +1000 power

  // Engine: TURN_ENDED:p0 -> TURN_STARTED:p1 -> PHASE_CHANGED:p1 -> GAME_OVER:p0, so the loss is written after hand-off.
  // OP15-022 text (docs/cards/OP-15.md:158) and rule 6-6-1-4 (line 624): the loss lands inside End Phase, before the turn ends.
  it.fails("F4 the effect that empties the deck finishes, then the loss is written at End Phase before p1's turn starts (ratchet OPT-962)", () => {
    const b = base([
      synCard("BROOK-LEADER", BROOK_SCHEMA, { ...CARDS.LEADER, id: "BROOK-LEADER", effectSchema: BROOK_SCHEMA }),
      synCard(MILLER, schema(MILLER, "Character", [
        {
          id: "miller-activate",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [
            { type: "MILL", params: { amount: 2 } },
            { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" }, chain: "THEN" },
          ],
        },
      ])),
    ]);
    const players = [...b.state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], leader: { ...players[0].leader, cardId: "BROOK-LEADER" }, deck: [inst(CARDS.VANILLA.id, 0, "DECK"), inst(CARDS.VANILLA.id, 0, "DECK")] };
    b.state = { ...b.state, players };
    const miller = placeChar(b, inst(MILLER, 0, "CHARACTER"));

    run(b, { type: "ACTIVATE_EFFECT", cardInstanceId: miller.instanceId, effectId: "miller-activate" });

    expect(b.state.players[0].deck).toHaveLength(0);
    expect(b.state.eventLog.some((e) => e.type === "POWER_MODIFIED")).toBe(true);
    expect(b.state.status).toBe("IN_PROGRESS");

    run(b, { type: "ADVANCE_PHASE" });

    expect(b.state.status).toBe("FINISHED");
    expect(b.state.winner).toBe(1);
    const types = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    const over = types.findIndex((t) => t.startsWith("GAME_OVER"));
    expect(over).toBeGreaterThanOrEqual(0);
    expect(over).toBeLessThan(types.indexOf("TURN_ENDED:p0"));
    expect(types).not.toContain("TURN_STARTED:p1");
  });
});

// ─── F13 ─────────────────────────────────────────────────────────────────────

describe("F13 ST13-002 with Kalgara: an effect newly fulfilled in the End of Your Turn wave resolves in that wave (ST13-002 text; rules 6-6-1-1 line 607, 6-6-1-1-2 line 611, 8-6-1 line 858; Decision 9; FAQ qa_st-13.md:13-15)", () => {
  const ACE_LEADER = "ST13-002";
  const KALGARA = "OP12-099";

  function setupF13(): { b: Built; faceUp: string } {
    const b = base([
      synCard(KALGARA, OP12_099_KALGARA),
      synCard(ACE_LEADER, ST13_002_PORTGAS_D_ACE, { ...CARDS.LEADER, id: ACE_LEADER, effectSchema: ST13_002_PORTGAS_D_ACE }),
    ]);
    const leader: CardInstance = { ...b.state.players[0].leader, cardId: ACE_LEADER };
    const players = [...b.state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader,
      life: [{ instanceId: "p0-face-up-life", cardId: CARDS.BANISH.id, face: "UP" }],
    };
    b.state = registerTriggersForCard({ ...b.state, players }, leader, b.cardDb.get(ACE_LEADER)!);
    placeChar(b, inst(KALGARA, 0, "CHARACTER"));
    fillDecks(b);
    return { b, faceUp: CARDS.BANISH.id };
  }

  // Engine: PHASE_CHANGED -> TURN_ENDED:p0 -> TURN_STARTED:p1 -> PHASE_CHANGED:p1 -> CARD_TRASHED:p0 -> CARD_REMOVED_FROM_LIFE:p0; no wave, no p0 draw.
  // Rule 6-6-1-1 (line 607) / 8-6-1 (line 858): Ace's trash and Kalgara's draw resolve in p0's wave, before TURN_ENDED.
  it.fails("F13 face-up Life card is trashed, then Kalgara draws once, both before TURN_ENDED:p0 (ratchet OPT-962)", () => {
    const { b, faceUp } = setupF13();

    run(b, { type: "ADVANCE_PHASE" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    const removedAt = log.findIndex((e) => e === "CARD_REMOVED_FROM_LIFE:p0" || e === "CARD_TRASHED:p0");
    expect(removedAt).toBeGreaterThanOrEqual(0);
    expect(removedAt).toBeLessThan(endedAt);
    const draws = log.map((e, i) => (e === "CARD_DRAWN:p0" ? i : -1)).filter((i) => i >= 0);
    expect(draws).toHaveLength(1);
    expect(removedAt).toBeLessThan(draws[0]);
    expect(draws[0]).toBeLessThan(endedAt);
    expect(b.state.players[0].trash.some((c) => c.cardId === faceUp)).toBe(true);
  });
});

// ─── F14 ─────────────────────────────────────────────────────────────────────

/**
 * p1's "until end of your opponent's turn" +1000 on `target`: created on p1's
 * turn, it expires in p0's End Phase (wave END_OF_END_PHASE, rule 6-6-1-2
 * step 2). Modelling gap (README §3.1): the engine has no distinct "until end
 * of turn" versus "during this turn" duration; UNTIL_END_OF_OPPONENT_NEXT_END_PHASE
 * and THIS_TURN stand in for the two rule phrases until OPT-924/OPT-962 tag
 * each obligation with its stage.
 */
function untilEndOfOpponentsTurnPlus1000(b: Built, target: CardInstance): RuntimeActiveEffect {
  return {
    ...thisTurnPlus1000(b, target),
    id: `syn-until-end-${target.instanceId}`,
    duration: { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" },
    expiresAt: { wave: "END_OF_END_PHASE", turn: b.state.turn.number, player: 0 },
    controller: 1,
  };
}

/** p1's "during this turn" carrier, distinctly named so observation 2 can see it and only it. */
const DURING_THIS_TURN_CARD: CardData = { ...CARDS.VANILLA, id: "SYN-DURING-THIS-TURN", name: "SYN-DURING-THIS-TURN" };

describe("F14 Three expiry stages per player (rules 6-6-1-2 line 617, 6-6-1-3 line 622; Decision 9; FAQ qa_op10.md:14-16)", () => {
  // Observation 1 (stage 1 before stage 2): p0's scheduled action reads p1's c1a, whose
  // "until end of your opponent's turn" +1000 must still be live (p1's expiry is stage 2).
  // Observation 2 (stage 1 expiry before stage 2, and stage 2 before stage 3): p1's scheduled
  // action reads p0's c0, whose "until end of turn" +1000 must already be GONE, and needs some
  // p1 Character still at 5000+ (c1b's "during this turn" +1000 expires only at stage 3).
  // A mutant that runs all expiry after both scheduled actions fails observation 2 (c0 still 5000);
  // a mutant that runs all expiry before any scheduled action fails observation 1 (c1a at 4000).
  // Engine today: all expiry first, so no draw at all. Rules 6-6-1-2 / 6-6-1-3 and Decision 9.
  it.fails("F14 p0 scheduled draw sees p1's until-end modifier; p1 scheduled draw sees p0's modifier gone and p1's during-this-turn modifier live; both before TURN_ENDED:p0 (ratchet OPT-962)", () => {
    const b = base([DURING_THIS_TURN_CARD]);
    const c0 = placeChar(b, inst(CARDS.VANILLA.id, 0, "CHARACTER"));
    const c1a = placeChar(b, inst(CARDS.VANILLA.id, 1, "CHARACTER"));
    const c1b = placeChar(b, inst(DURING_THIS_TURN_CARD.id, 1, "CHARACTER"));
    fillDecks(b);
    const m0 = thisTurnPlus1000(b, c0); // p0's "until end of turn" (stage 1 expiry)
    const m1a = untilEndOfOpponentsTurnPlus1000(b, c1a); // p1's "until end of your opponent's turn" (stage 2 expiry)
    const m1b: RuntimeActiveEffect = { ...thisTurnPlus1000(b, c1b), id: `syn-during-${c1b.instanceId}`, controller: 1 }; // p1's "during this turn" (stage 3 expiry)
    const p0Action: RuntimeScheduledAction = {
      id: "syn-scheduled-draw-0",
      timing: "END_OF_THIS_TURN",
      // "self" is the scheduled entry's source: p1's c1a. Draw only while its +1000 is live.
      action: { type: "DRAW", params: { amount: 1 }, conditions: POWER_5000 },
      boundToInstanceId: null,
      sourceEffectId: c1a.instanceId,
      controller: 0,
    };
    const p1Action: RuntimeScheduledAction = {
      id: "syn-scheduled-draw-1",
      timing: "END_OF_THIS_TURN",
      action: {
        type: "DRAW",
        params: { amount: 1 },
        conditions: {
          all_of: [
            // "self" is p0's c0: its "until end of turn" +1000 must already have expired.
            { type: "SELF_POWER", operator: "<=", value: 4000 },
            // and c1b specifically must still be at 5000+ (its "during this turn" +1000); the name
            // filter keeps c1a (until-end modifier) and the Leader from satisfying this clause.
            { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: DURING_THIS_TURN_CARD.name, power_min: 5000 } },
          ],
        },
      },
      boundToInstanceId: null,
      sourceEffectId: c0.instanceId,
      controller: 1,
    };
    b.state = { ...b.state, activeEffects: [m0, m1a, m1b], scheduledActions: [p0Action, p1Action] };

    run(b, { type: "ADVANCE_PHASE" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    expect(log, "observation 1: p0 draws while p1's until-end modifier is live").toContain("CARD_DRAWN:p0");
    expect(log, "observation 2: p1 draws after p0's modifier expired and while p1's during-this-turn modifier is live").toContain("CARD_DRAWN:p1");
    expect(log.indexOf("CARD_DRAWN:p0")).toBeLessThan(log.indexOf("CARD_DRAWN:p1"));
    expect(log.indexOf("CARD_DRAWN:p1")).toBeLessThan(endedAt);
    expect(b.state.activeEffects.some((e) => [m0.id, m1a.id, m1b.id].includes(e.id))).toBe(false);
  });
});

// ─── F13 loop budget ─────────────────────────────────────────────────────────

describe("F13 loop budget: an End of Your Turn wave that re-fulfils itself ends in the engine-limit outcome (rev4 §7, Decision 5; MAX_RESOLUTION_ACTIONS 1000 at engine-limits.ts:9, DEFAULT_ACTION_BUDGET 1000 at execution-context.ts:3, MAX_EFFECT_STACK_DEPTH 100 at engine-limits.ts:8)", () => {
  const ACE_LEADER = "ST13-002";
  const LOOPER = "SYN-LIFE-LOOPER"; // when a card is removed from your Life: add 1 from deck to Life face-up, then trash 1 Life card

  function setupLoop(): Built {
    const b = base([
      synCard(ACE_LEADER, ST13_002_PORTGAS_D_ACE, { ...CARDS.LEADER, id: ACE_LEADER, effectSchema: ST13_002_PORTGAS_D_ACE }),
      synCard(LOOPER, schema(LOOPER, "Character", [
        {
          id: "looper",
          category: "auto",
          trigger: { event: "CARD_REMOVED_FROM_LIFE", filter: { controller: "SELF" } },
          actions: [
            { type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, face: "UP", position: "TOP" } },
            { type: "TRASH_FROM_LIFE", params: { amount: 1, position: "TOP" }, chain: "THEN" },
          ],
        },
      ])),
    ]);
    const leader: CardInstance = { ...b.state.players[0].leader, cardId: ACE_LEADER };
    const players = [...b.state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader,
      life: [{ instanceId: "p0-face-up-life", cardId: CARDS.BANISH.id, face: "UP" }],
      deck: Array.from({ length: 1200 }, () => inst(CARDS.VANILLA.id, 0, "DECK")),
    };
    b.state = registerTriggersForCard({ ...b.state, players }, leader, b.cardDb.get(ACE_LEADER)!);
    placeChar(b, inst(LOOPER, 0, "CHARACTER"));
    return b;
  }

  it("F13 loop guard: the wave terminates within the engine budget with a terminal state and no prompt afterwards", () => {
    const b = setupLoop();
    const limit = b.state.executionContext.actionBudget.limit;

    run(b, { type: "ADVANCE_PHASE" });

    expect(b.state.status).toBe("FINISHED");
    expect(b.state.pendingPrompt).toBeNull();
    expect(b.state.effectStack).toEqual([]);
    expect(b.state.engineOutcome?.diagnostic.kind).toMatch(/^(ACTION_BUDGET|STACK_DEPTH)$/);
    expect(b.state.executionContext.actionBudget.consumed).toBeLessThanOrEqual(limit + 1);
    expect(b.state.eventLog.filter((e) => e.type === "GAME_OVER")).toHaveLength(1);
  });

  // Engine: the loop ends as engineOutcome.type "INFINITE_LOOP_DRAW" with the draw reason, which is the
  // rule 11-1-1-1 outcome. Decision 5 (rev4 §10): budget exhaustion is an engine-limit outcome distinct
  // from a rules draw; OPT-949 (OPT-960) introduces that outcome.
  it.fails("F13 loop ratchet: the outcome is an engine limit, not a rules draw (ratchet OPT-960, Decision 5)", () => {
    const b = setupLoop();

    run(b, { type: "ADVANCE_PHASE" });

    expect(b.state.status).toBe("FINISHED");
    expect(b.state.engineOutcome?.type).not.toBe("INFINITE_LOOP_DRAW");
    expect(b.state.winReason ?? "").not.toMatch(/draw/i);
  });
});
