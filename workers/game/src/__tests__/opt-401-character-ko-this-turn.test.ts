/**
 * OPT-401 — CHARACTER_KO in ACTION_PERFORMED_THIS_TURN.
 *
 * OP16-100 Hallowed Glacier Slash: "If your opponent's Character has been
 * K.O.'d during this turn, set your Leader [Yamato] as active."
 *
 * Every K.O. (battle or effect) flows through emitEvent as CARD_KO; the bus
 * records a CHARACTER_KO performed-action with the K.O.'d card's owner so
 * the condition can scope to SELF/OPPONENT.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import { evaluateCondition } from "../engine/conditions.js";
import { emitEvent } from "../engine/events.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Black"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeInstance(cardId: string, instanceId: string, zone: "LEADER" | "CHARACTER", owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "LEADER" ? null : 1,
    controller: owner,
    owner,
  };
}

function emptyPlayer(playerId: string, leader: CardInstance): PlayerState {
  return {
    playerId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: [],
    life: [],
    donDeck: [],
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  };
}

function makeState(): { state: GameState; db: Map<string, CardData> } {
  const l0 = makeCard("L0-DATA", { type: "Leader", cost: null, life: 5 });
  const l1 = makeCard("L1-DATA", { type: "Leader", cost: null, life: 5 });
  const db = new Map<string, CardData>([[l0.id, l0], [l1.id, l1]]);
  const state = {
    id: "g",
    players: [
      emptyPlayer("p0", makeInstance(l0.id, "L0", "LEADER", 0)),
      emptyPlayer("p1", makeInstance(l1.id, "L1", "LEADER", 1)),
    ],
    turn: { number: 1, activePlayerIndex: 0, phase: "MAIN", battleSubPhase: null, battle: null, oncePerTurnUsed: {}, actionsPerformedThisTurn: [], deckHitZeroThisTurn: [false, false] },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pregame: null,
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
  } as unknown as GameState;
  return { state, db };
}

const koCond = (controller: "SELF" | "OPPONENT" | "EITHER") => ({
  type: "ACTION_PERFORMED_THIS_TURN" as const,
  controller,
  action: "CHARACTER_KO" as const,
});

describe("OPT-401: CHARACTER_KO performed-action tracking (OP16-100)", () => {
  it("records a CHARACTER_KO entry when a CARD_KO event is emitted", () => {
    const { state } = makeState();
    const next = emitEvent(state, "CARD_KO", 1, {
      cardInstanceId: "c9",
      cardId: "X",
      cause: "BATTLE",
      causingController: 0,
      preKO_donCount: 0,
    } as never);
    expect(next.turn.actionsPerformedThisTurn).toEqual([
      expect.objectContaining({ actionType: "CHARACTER_KO", controller: 1 }),
    ]);
  });

  it("condition matches an opponent-character K.O. from player 0's perspective", () => {
    const { state, db } = makeState();
    const next = emitEvent(state, "CARD_KO", 1, { cardInstanceId: "c9" } as never);
    expect(evaluateCondition(next, koCond("OPPONENT"), { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
    // Same K.O. viewed from player 1: it was THEIR character, not the opponent's.
    expect(evaluateCondition(next, koCond("OPPONENT"), { sourceCardInstanceId: "L1", cardDb: db, controller: 1 })).toBe(false);
    expect(evaluateCondition(next, koCond("SELF"), { sourceCardInstanceId: "L1", cardDb: db, controller: 1 })).toBe(true);
    expect(evaluateCondition(next, koCond("EITHER"), { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(true);
  });

  it("condition is false when no K.O. happened this turn", () => {
    const { state, db } = makeState();
    expect(evaluateCondition(state, koCond("OPPONENT"), { sourceCardInstanceId: "L0", cardDb: db, controller: 0 })).toBe(false);
  });

  it("other events do not record CHARACTER_KO", () => {
    const { state } = makeState();
    const next = emitEvent(state, "CARD_TRASHED", 1, { cardInstanceId: "c9", reason: "effect" } as never);
    expect(next.turn.actionsPerformedThisTurn).toEqual([]);
  });
});
