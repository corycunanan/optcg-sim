/**
 * Test helpers — shared utilities for engine tests.
 *
 * Provides deterministic card data, game payloads, and state builders
 * so individual tests can focus on the scenario being tested.
 */

import type { CardData, CardInstance, DonInstance, GameState, KeywordSet, GameInitPayload, PlayerState } from "../types.js";
import { buildInitialState } from "../engine/setup.js";
import { runPipeline } from "../engine/pipeline.js";

function noKeywords(): KeywordSet {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
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

// ─── Test card catalog ───────────────────────────────────────────────────────

export const CARDS = {
  LEADER: makeCard("LEADER-T", { type: "Leader", cost: null, power: 5000, life: 5 }),
  VANILLA: makeCard("CHAR-VANILLA", { cost: 3, power: 4000, counter: 1000 }),
  RUSH: makeCard("CHAR-RUSH", { cost: 2, power: 3000, keywords: { ...noKeywords(), rush: true } }),
  RUSH_CHAR: makeCard("CHAR-RUSH-C", { cost: 2, power: 3000, keywords: { ...noKeywords(), rushCharacter: true } }),
  DOUBLE_ATK: makeCard("CHAR-DATK", { cost: 4, power: 5000, keywords: { ...noKeywords(), doubleAttack: true } }),
  BLOCKER: makeCard("CHAR-BLOCKER", { cost: 3, power: 4000, keywords: { ...noKeywords(), blocker: true } }),
  BANISH: makeCard("CHAR-BANISH", { cost: 2, power: 3000, keywords: { ...noKeywords(), banish: true } }),
  TRIGGER: makeCard("CHAR-TRIGGER", { cost: 1, power: 2000, counter: 1000, keywords: { ...noKeywords(), trigger: true } }),
  UNBLOCKABLE: makeCard("CHAR-UNBLK", { cost: 4, power: 5000, keywords: { ...noKeywords(), unblockable: true } }),
  COUNTER: makeCard("CHAR-COUNTER", { cost: 2, power: 3000, counter: 2000 }),
  EVENT_COUNTER: makeCard("EVENT-CTR", { type: "Event", cost: 1, power: null, counter: null }),
  STAGE: makeCard("STAGE-T", { type: "Stage", cost: 2, power: null }),
} as const;

export function createTestCardDb(): Map<string, CardData> {
  const db = new Map<string, CardData>();
  for (const card of Object.values(CARDS)) {
    db.set(card.id, card);
  }
  return db;
}

// ─── Game payload / state builders ───────────────────────────────────────────

function makePlayerInit(userId: string): GameInitPayload["player1"] {
  return {
    userId,
    leader: { cardId: CARDS.LEADER.id, quantity: 1, cardData: CARDS.LEADER },
    deck: [
      { cardId: CARDS.VANILLA.id, quantity: 16, cardData: CARDS.VANILLA },
      { cardId: CARDS.RUSH.id, quantity: 4, cardData: CARDS.RUSH },
      { cardId: CARDS.DOUBLE_ATK.id, quantity: 4, cardData: CARDS.DOUBLE_ATK },
      { cardId: CARDS.BLOCKER.id, quantity: 4, cardData: CARDS.BLOCKER },
      { cardId: CARDS.BANISH.id, quantity: 4, cardData: CARDS.BANISH },
      { cardId: CARDS.TRIGGER.id, quantity: 4, cardData: CARDS.TRIGGER },
      { cardId: CARDS.UNBLOCKABLE.id, quantity: 4, cardData: CARDS.UNBLOCKABLE },
      { cardId: CARDS.COUNTER.id, quantity: 6, cardData: CARDS.COUNTER },
      { cardId: CARDS.EVENT_COUNTER.id, quantity: 2, cardData: CARDS.EVENT_COUNTER },
      { cardId: CARDS.STAGE.id, quantity: 2, cardData: CARDS.STAGE },
    ],
  };
}

export function createTestPayload(): GameInitPayload {
  return {
    gameId: "test-game-001",
    player1: makePlayerInit("user-p1"),
    player2: makePlayerInit("user-p2"),
    format: "standard",
  };
}

/** Pad a character list to 5 fixed slots (null = empty). */
export function padChars(chars: CardInstance[]): (CardInstance | null)[] {
  const slots: (CardInstance | null)[] = [null, null, null, null, null];
  for (let i = 0; i < Math.min(chars.length, 5); i++) slots[i] = chars[i];
  return slots;
}

export function setupGame(): { state: GameState; cardDb: Map<string, CardData> } {
  const payload = createTestPayload();
  return buildInitialState(payload);
}

/**
 * Advance state from current phase through to the target phase.
 * Runs ADVANCE_PHASE actions through the pipeline until the target is reached.
 * Returns null if something goes wrong.
 */
export function advanceToPhase(
  state: GameState,
  targetPhase: "REFRESH" | "DRAW" | "DON" | "MAIN" | "END",
  cardDb: Map<string, CardData>,
): GameState {
  const phaseOrder = ["REFRESH", "DRAW", "DON", "MAIN", "END"];
  let current = state;
  let safety = 10;

  while (current.turn.phase !== targetPhase && safety-- > 0) {
    const idx = phaseOrder.indexOf(current.turn.phase);
    const targetIdx = phaseOrder.indexOf(targetPhase);
    if (idx >= targetIdx && targetPhase !== "REFRESH") break;

    const result = runPipeline(current, { type: "ADVANCE_PHASE" }, cardDb, current.turn.activePlayerIndex);
    if (!result.valid) break;
    current = result.state;
  }

  return current;
}

/**
 * Build a mid-game state ready for battle testing.
 * Player 0 is active in MAIN phase with DON!! available and characters on board.
 */
export function createBattleReadyState(cardDb: Map<string, CardData>): GameState {
  let { state } = setupGame();

  // Fast-forward: set phase to MAIN, give both players resources
  state = {
    ...state,
    turn: {
      ...state.turn,
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
    },
  };

  // Give player 0 active DON!! in cost area
  const p0DonCostArea: DonInstance[] = Array.from({ length: 8 }, (_, i) => ({
    instanceId: `don-p0-${i}`,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));

  // Give player 1 active DON!! in cost area
  const p1DonCostArea: DonInstance[] = Array.from({ length: 6 }, (_, i) => ({
    instanceId: `don-p1-${i}`,
    state: "ACTIVE" as const,
    attachedTo: null,
  }));

  // Place some characters on the board for both players
  const makeCharInstance = (
    cardId: string,
    owner: 0 | 1,
    suffix: string,
    cardState: "ACTIVE" | "RESTED" = "ACTIVE",
  ): CardInstance => ({
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: cardState,
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  });

  const p0Chars = [
    makeCharInstance(CARDS.VANILLA.id, 0, "v1"),
    makeCharInstance(CARDS.BLOCKER.id, 0, "b1"),
  ];
  const p1Chars = [
    makeCharInstance(CARDS.VANILLA.id, 1, "v1"),
    makeCharInstance(CARDS.BLOCKER.id, 1, "b1"),
  ];

  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[0] = {
    ...newPlayers[0],
    donCostArea: p0DonCostArea,
    donDeck: newPlayers[0].donDeck.slice(0, 2),
    characters: padChars(p0Chars),
  };
  newPlayers[1] = {
    ...newPlayers[1],
    donCostArea: p1DonCostArea,
    donDeck: newPlayers[1].donDeck.slice(0, 4),
    characters: padChars(p1Chars),
  };

  return { ...state, players: newPlayers };
}
