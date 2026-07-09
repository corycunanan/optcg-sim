/**
 * OPT-408 — Refresh Phase effect expiry + computeExpiry turn math.
 *
 * expireRefreshPhaseEffects was never wired into the REFRESH phase, and the
 * END_OF_END_PHASE wave (UNTIL_END_OF_OPPONENT_NEXT_TURN) was never fired at
 * all. On top of that, computeExpiry's +1/+2 turn math assumed per-player
 * turn numbering, but turn.number counts ROUNDS since OPT-366 — both seats
 * share a number within a round, so expiries are stamped with the seat whose
 * turn (or refresh) they anchor to and compared by (round, seat) slot.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState, KeywordSet } from "../types.js";
import type { Duration, RuntimeActiveEffect } from "../engine/effect-types.js";
import { executeAdvancePhase } from "../engine/phases.js";
import { computeExpiry } from "../engine/effect-resolver/action-utils.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Leader",
    color: ["Black"],
    cost: null,
    power: 5000,
    counter: null,
    life: 5,
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

function makeLeader(cardId: string, instanceId: string, owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "LEADER",
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

function makeState(opts: {
  activePlayerIndex: 0 | 1;
  firstPlayerIndex?: 0 | 1;
  turnNumber?: number;
}): { state: GameState; db: Map<string, CardData> } {
  const l0 = makeCard("L0-DATA");
  const l1 = makeCard("L1-DATA");
  const db = new Map<string, CardData>([[l0.id, l0], [l1.id, l1]]);
  const state = {
    id: "g",
    players: [
      emptyPlayer("p0", makeLeader(l0.id, "L0", 0)),
      emptyPlayer("p1", makeLeader(l1.id, "L1", 1)),
    ],
    turn: {
      number: opts.turnNumber ?? 1,
      activePlayerIndex: opts.activePlayerIndex,
      firstPlayerIndex: opts.firstPlayerIndex ?? 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
      deckHitZeroThisTurn: [false, false],
    },
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

function addEffect(state: GameState, duration: Duration, controller: 0 | 1): GameState {
  const effect: RuntimeActiveEffect = {
    id: `eff-${duration.type}-${controller}`,
    sourceCardInstanceId: controller === 0 ? "L0" : "L1",
    sourceEffectBlockId: "block-1",
    category: "auto",
    modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 }, duration }],
    duration,
    expiresAt: computeExpiry(duration, state, controller),
    controller,
    appliesTo: [controller === 0 ? "L0" : "L1"],
    timestamp: Date.now(),
  };
  return { ...state, activeEffects: [...state.activeEffects, effect as any] };
}

/** MAIN → END: auto-runs the end phase and hands off to the opponent's REFRESH. */
function endTurn(state: GameState, db: Map<string, CardData>): GameState {
  expect(state.turn.phase).toBe("MAIN");
  return executeAdvancePhase(state, db).state;
}

/** REFRESH → DRAW (runs Refresh Phase steps, incl. step-1 expiry). */
function runRefresh(state: GameState, db: Map<string, CardData>): GameState {
  expect(state.turn.phase).toBe("REFRESH");
  return executeAdvancePhase(state, db).state;
}

/** REFRESH → DRAW → DON → MAIN. */
function startTurn(state: GameState, db: Map<string, CardData>): GameState {
  let s = runRefresh(state, db);
  s = executeAdvancePhase(s, db).state; // DRAW → DON
  s = executeAdvancePhase(s, db).state; // DON → MAIN
  return s;
}

const count = (s: GameState) => s.activeEffects.length;

describe("OPT-408: computeExpiry seat-aware turn math", () => {
  it("UNTIL_START_OF_YOUR_NEXT_TURN anchors to the caster's next turn", () => {
    // First player casting on their own turn (round 1) → their round-2 refresh
    const p0 = makeState({ activePlayerIndex: 0 }).state;
    expect(computeExpiry({ type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, p0, 0))
      .toEqual({ wave: "REFRESH_PHASE", turn: 2, player: 0 });

    // Second player casting on their own turn (round 1) → their round-2 refresh
    const p1 = makeState({ activePlayerIndex: 1 }).state;
    expect(computeExpiry({ type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, p1, 1))
      .toEqual({ wave: "REFRESH_PHASE", turn: 2, player: 1 });

    // Second player casting DURING the first player's turn (e.g. a counter):
    // their next turn is still ahead in the current round.
    expect(computeExpiry({ type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, p0, 1))
      .toEqual({ wave: "REFRESH_PHASE", turn: 1, player: 1 });
  });

  it("UNTIL_END_OF_OPPONENT_NEXT_TURN anchors to the opponent's next turn", () => {
    // First player casting → opponent's turn later this round
    const p0 = makeState({ activePlayerIndex: 0 }).state;
    expect(computeExpiry({ type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }, p0, 0))
      .toEqual({ wave: "END_OF_END_PHASE", turn: 1, player: 1 });

    // Second player casting → opponent (first player) next plays in round 2
    const p1 = makeState({ activePlayerIndex: 1 }).state;
    expect(computeExpiry({ type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }, p1, 1))
      .toEqual({ wave: "END_OF_END_PHASE", turn: 2, player: 0 });
  });

  it("respects firstPlayerIndex = 1 (player 1 goes first)", () => {
    // P0 is the SECOND player; casting on their own turn in round 1 →
    // their next turn is round 2's second slot.
    const s = makeState({ activePlayerIndex: 0, firstPlayerIndex: 1 }).state;
    expect(computeExpiry({ type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, s, 0))
      .toEqual({ wave: "REFRESH_PHASE", turn: 2, player: 0 });
    // Opponent (P1, first player) next plays in round 2.
    expect(computeExpiry({ type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }, s, 0))
      .toEqual({ wave: "END_OF_END_PHASE", turn: 2, player: 1 });
  });
});

describe("OPT-408: UNTIL_START_OF_YOUR_NEXT_TURN expires at the caster's next refresh", () => {
  it("first-player caster: survives opponent's refresh, expires at own round-2 refresh", () => {
    const { state, db } = makeState({ activePlayerIndex: 0 });
    let s = addEffect(state, { type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, 0);

    s = endTurn(s, db); // → P1 REFRESH (round 1)
    s = startTurn(s, db); // P1's refresh ran — must NOT expire the effect
    expect(count(s)).toBe(1);

    s = endTurn(s, db); // → P0 REFRESH (round 2)
    expect(count(s)).toBe(1); // still alive until refresh step 1 runs
    s = runRefresh(s, db);
    expect(count(s)).toBe(0);
  });

  it("second-player caster: survives first player's round-2 refresh, expires at own", () => {
    const { state, db } = makeState({ activePlayerIndex: 1 });
    let s = addEffect(state, { type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, 1);

    s = endTurn(s, db); // → P0 REFRESH (round 2)
    s = startTurn(s, db); // P0's refresh ran — same turn.number, different seat
    expect(count(s)).toBe(1);

    s = endTurn(s, db); // → P1 REFRESH (round 2)
    s = runRefresh(s, db);
    expect(count(s)).toBe(0);
  });

  it("counter cast during the opponent's turn expires at the caster's refresh that same round", () => {
    // P1 casts during P0's round-1 turn; P1's own turn is still ahead.
    const { state, db } = makeState({ activePlayerIndex: 0 });
    let s = addEffect(state, { type: "UNTIL_START_OF_YOUR_NEXT_TURN" }, 1);

    s = endTurn(s, db); // → P1 REFRESH (round 1)
    s = runRefresh(s, db);
    expect(count(s)).toBe(0);
  });
});

describe("OPT-408: UNTIL_END_OF_OPPONENT_NEXT_TURN expires at end of the opponent's next turn", () => {
  it("first-player caster: survives own end phase, expires at end of opponent's turn", () => {
    const { state, db } = makeState({ activePlayerIndex: 0 });
    let s = addEffect(state, { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }, 0);

    s = endTurn(s, db); // P0's own end phase must NOT expire it
    expect(count(s)).toBe(1);

    s = startTurn(s, db); // P1's turn (round 1)
    s = endTurn(s, db); // end of opponent's turn → expired
    expect(count(s)).toBe(0);
  });

  it("second-player caster: lasts through the first player's round-2 turn", () => {
    const { state, db } = makeState({ activePlayerIndex: 1 });
    let s = addEffect(state, { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }, 1);

    s = endTurn(s, db); // P1's own end phase — survives
    expect(count(s)).toBe(1);

    s = startTurn(s, db); // P0's turn (round 2)
    s = endTurn(s, db); // end of P0's turn → expired
    expect(count(s)).toBe(0);
  });

  it("UNTIL_END_OF_OPPONENT_NEXT_END_PHASE behaves identically", () => {
    const { state, db } = makeState({ activePlayerIndex: 0 });
    let s = addEffect(state, { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }, 0);

    s = endTurn(s, db);
    expect(count(s)).toBe(1);
    s = startTurn(s, db);
    s = endTurn(s, db);
    expect(count(s)).toBe(0);
  });
});

describe("OPT-408: UNTIL_END_OF_YOUR_NEXT_TURN expires at end of the caster's next turn", () => {
  it("survives own end phase and the opponent's turn, expires at end of own round-2 turn", () => {
    const { state, db } = makeState({ activePlayerIndex: 0 });
    let s = addEffect(state, { type: "UNTIL_END_OF_YOUR_NEXT_TURN" }, 0);

    s = endTurn(s, db); // end of P0 round 1 — survives
    expect(count(s)).toBe(1);
    s = startTurn(s, db);
    s = endTurn(s, db); // end of P1 round 1 — survives
    expect(count(s)).toBe(1);
    s = startTurn(s, db);
    s = endTurn(s, db); // end of P0 round 2 → expired
    expect(count(s)).toBe(0);
  });
});

describe("OPT-408: legacy seatless expiries (persisted pre-fix state)", () => {
  it("falls back to the turn-only comparison and still expires", () => {
    const { state, db } = makeState({ activePlayerIndex: 0, turnNumber: 3 });
    const legacy = {
      id: "eff-legacy",
      sourceCardInstanceId: "L0",
      sourceEffectBlockId: "block-1",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 } }],
      duration: { type: "UNTIL_START_OF_YOUR_NEXT_TURN" },
      expiresAt: { wave: "REFRESH_PHASE", turn: 3 }, // no player stamp
      controller: 0,
      appliesTo: ["L0"],
      timestamp: Date.now(),
    };
    let s = { ...state, activeEffects: [legacy as any] } as GameState;
    s = { ...s, turn: { ...s.turn, phase: "REFRESH" } };
    s = runRefresh(s, db);
    expect(count(s)).toBe(0);
  });
});
