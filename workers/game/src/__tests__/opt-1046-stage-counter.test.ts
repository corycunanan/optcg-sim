/**
 * OPT-1046 — Stage cards as symbol Counters: OP18-021 Franky (Leader) "All
 * Stage cards in your hand have a +3000 Counter." FAQ (qa_op18.md): the Stage
 * is used in the Counter Step like a Character with a printed Counter.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, KeywordSet, PlayerState } from "../types.js";
import { validate } from "../engine/validation.js";
import { executeUseCounter } from "../engine/battle.js";
import { getEffectiveCounterValue } from "../engine/counter-value.js";
import { OP18_021_FRANKY } from "../engine/schemas/op18.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id, name: id, type: "Character", color: ["Green"], cost: 3, power: 5000, counter: null, life: null,
    attribute: [], types: [], effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
    ...overrides,
  };
}

function inst(cardId: string, instanceId: string, zone: CardInstance["zone"], owner: 0 | 1): CardInstance {
  return { instanceId, cardId, zone, state: "ACTIVE", attachedDon: [], turnPlayed: zone === "HAND" ? null : 1, controller: owner, owner };
}

function player(playerId: string, leader: CardInstance, hand: CardInstance[] = []): PlayerState {
  return {
    playerId, leader, characters: [null, null, null, null, null], stage: null, hand, deck: [], life: [], donDeck: [],
    donCostArea: [], trash: [], removedFromGame: [], deckList: [], connected: true, awayReason: null,
    rejoinDeadlineAt: null, sleeveUrl: null, donArtUrl: null,
  };
}

const FRANKY = makeCard("OP18-021", { name: "Franky", type: "Leader", cost: null, life: 5, power: 5000, effectSchema: OP18_021_FRANKY });
const OTHER_LEADER = makeCard("OTHER-LEADER", { type: "Leader", cost: null, life: 5 });
const STAGE = makeCard("STAGE-X", { type: "Stage", power: null, cost: 2 });
const OPP_LEADER = makeCard("OPP-LEADER", { type: "Leader", cost: null, life: 5, power: 6000 });

function build(leader: CardData) {
  const db = new Map<string, CardData>([leader, STAGE, OPP_LEADER].map((c) => [c.id, c]));
  const p0 = player("p0", inst(leader.id, "L0", "LEADER", 0), [inst(STAGE.id, "h-stage", "HAND", 0)]);
  const p1 = player("p1", inst(OPP_LEADER.id, "L1", "LEADER", 1));
  const state = {
    id: "g", players: [p0, p1],
    turn: {
      number: 2, activePlayerIndex: 1, phase: "MAIN", battleSubPhase: "COUNTER_STEP",
      battle: { attackerInstanceId: "L1", targetInstanceId: "L0", attackerPower: 6000, defenderPower: 5000, counterPowerAdded: 0 },
      oncePerTurnUsed: {}, actionsPerformedThisTurn: [], deckHitZeroThisTurn: [false, false],
    },
    activeEffects: [], prohibitions: [], scheduledActions: [], oneTimeModifiers: [], triggerRegistry: [],
    pregame: null, pendingPrompt: null, effectStack: [], eventLog: [], status: "IN_PROGRESS", winner: null,
  } as unknown as GameState;
  return { state, db };
}

describe("OPT-1046 — Stage symbol counters", () => {
  it("with Franky: a Stage in hand is a +3000 Counter for the Leader", () => {
    const { state, db } = build(FRANKY);
    const stage = state.players[0].hand[0];
    expect(getEffectiveCounterValue(stage, STAGE, state, db)).toBe(3000);
    expect(validate(state, { type: "USE_COUNTER", cardInstanceId: "h-stage", counterTargetInstanceId: "L0" }, db, 0)).toBeNull();
    const result = executeUseCounter(state, "h-stage", "L0", db);
    expect(result.state.turn.battle!.counterPowerAdded).toBe(3000);
    expect(result.state.turn.battle!.defenderPower).toBe(8000);
    expect(result.state.players[0].hand).toHaveLength(0);
    expect(result.state.players[0].trash[0]?.cardId).toBe(STAGE.id);
    expect(result.events).toMatchObject([{ type: "COUNTER_USED", payload: { cardId: STAGE.id, counterValue: 3000 } }]);
  });

  it("without Franky: a Stage still cannot be used as a Counter", () => {
    const { state, db } = build(OTHER_LEADER);
    expect(validate(state, { type: "USE_COUNTER", cardInstanceId: "h-stage", counterTargetInstanceId: "L0" }, db, 0))
      .toContain("no counter value");
  });
});
