/**
 * OPT-404 — SEARCH_DECK pick_destination: "LIFE_TOP".
 *
 * OP16-119 Marshall.D.Teach: "[On Play] Look at 3 cards from the top of your
 * deck; add up to 1 card to the top of your Life cards. Then, place the rest
 * at the bottom of your deck in any order."
 *
 * The ARRANGE_TOP_CARDS resume for SEARCH_DECK must route the kept card to
 * the top of Life (face-down by default) instead of hand when the paused
 * action carries pick_destination: "LIFE_TOP".
 */

import { describe, it, expect } from "vitest";
import type { Action } from "../engine/effect-types.js";
import type { CardInstance, GameState, PendingEvent, PlayerState } from "../types.js";
import { handleArrangeSearchDeck } from "../engine/effect-resolver/resume/deck.js";

function makeInstance(cardId: string, instanceId: string, zone: CardInstance["zone"], owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
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

function makeState(): GameState {
  const p0 = emptyPlayer("p0", makeInstance("L0-DATA", "L0", "LEADER", 0));
  p0.deck = [
    makeInstance("D1", "d1", "DECK", 0),
    makeInstance("D2", "d2", "DECK", 0),
    makeInstance("D3", "d3", "DECK", 0),
    makeInstance("D4", "d4", "DECK", 0),
  ];
  p0.life = [{ instanceId: "lf1", cardId: "LF1", face: "DOWN" }];
  const p1 = emptyPlayer("p1", makeInstance("L1-DATA", "L1", "LEADER", 1));
  return {
    id: "g",
    players: [p0, p1],
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
}

function pausedSearch(pickDestination?: string): Action {
  return {
    type: "SEARCH_DECK",
    params: {
      look_at: 3,
      pick: { up_to: 1 },
      rest_destination: "BOTTOM",
      ...(pickDestination ? { pick_destination: pickDestination } : {}),
    },
  } as Action;
}

describe("OPT-404: SEARCH_DECK pick to top of Life (OP16-119)", () => {
  it("routes the kept card to the top of Life face-down", () => {
    const state = makeState();
    const events: PendingEvent[] = [];
    const next = handleArrangeSearchDeck(
      state,
      { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "d2", orderedInstanceIds: ["d1", "d3"], destination: "bottom" },
      pausedSearch("LIFE_TOP"),
      0,
      ["d1", "d2", "d3"],
      events,
    );
    expect(next).not.toBeNull();
    const p0 = next!.players[0];
    expect(p0.life.map((l) => l.cardId)).toEqual(["D2", "LF1"]);
    expect(p0.life.map((l) => l.instanceId)).not.toContain("d2");
    expect(p0.life[0].face).toBe("DOWN");
    expect(p0.hand).toHaveLength(0);
    // Rest went to the bottom of the deck in the chosen order.
    expect(p0.deck.map((c) => c.instanceId)).toEqual(["d4", "d1", "d3"]);
    // No draw event for a card that went to Life.
    expect(events).toHaveLength(0);
  });

  it("keeps the default hand destination when pick_destination is absent", () => {
    const state = makeState();
    const events: PendingEvent[] = [];
    const next = handleArrangeSearchDeck(
      state,
      { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "d2", orderedInstanceIds: ["d1", "d3"], destination: "bottom" },
      pausedSearch(),
      0,
      ["d1", "d2", "d3"],
      events,
    );
    const p0 = next!.players[0];
    expect(p0.hand.map((c) => c.cardId)).toEqual(["D2"]);
    expect(p0.hand.map((c) => c.instanceId)).not.toContain("d2");
    expect(p0.life).toHaveLength(1);
    expect(events).toEqual([
      expect.objectContaining({ type: "CARD_DRAWN" }),
    ]);
  });

  it("picking nothing leaves Life untouched", () => {
    const state = makeState();
    const events: PendingEvent[] = [];
    const next = handleArrangeSearchDeck(
      state,
      { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: ["d1", "d2", "d3"], destination: "bottom" },
      pausedSearch("LIFE_TOP"),
      0,
      ["d1", "d2", "d3"],
      events,
    );
    const p0 = next!.players[0];
    expect(p0.life).toHaveLength(1);
    expect(p0.deck.map((c) => c.instanceId)).toEqual(["d4", "d1", "d2", "d3"]);
  });
});
