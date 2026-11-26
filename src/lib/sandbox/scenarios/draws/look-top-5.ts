// Spectator scenarios (OPT-1056): "look at the top 5" as the Card Motion
// Lab's "Look at top 5" scenes.
// - You: the top card flips on the deck and the five fan into the center
//   face-up, 70ms apart. Your pick joins the end of your hand; the rest
//   flip face-down where they are and go to the bottom of the deck.
// - Opponent: their five fan face-down like a hand. The searched pick is
//   public, so it rises and flips up, flips back down and joins the end of
//   their hand. The rest flip face-up and travel to their trash.

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 3,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const TOP_IDS = ["OP01-030", "OP01-025", "P-028", "OP05-010", "ST01-006"];

const ME_DECK: CardInstance[] = [
  ...TOP_IDS.map((cardId, i) =>
    makeCard({ instanceId: `p0-look-${i}`, cardId, zone: "DECK", controller: 0 }),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    makeCard({ instanceId: `p0-deck-${i}`, cardId: "OP01-010", zone: "DECK", controller: 0 }),
  ),
];

const ME_HAND: CardInstance[] = ["OP01-010", "ST01-006", "OP11-003", "OP01-025"].map(
  (cardId, i) => makeCard({ instanceId: `p0-hand-${i}`, cardId, zone: "HAND", controller: 0 }),
);

// The viewer only receives redacted cards for the opponent's hand and deck.
const OPP_HAND: CardInstance[] = Array.from({ length: 5 }, (_, i) =>
  makeCard({ instanceId: `p1-hand-${i}`, cardId: "hidden", zone: "HAND", controller: 1 }),
);
const OPP_TOP_IDS = ["OP01-030", "OP01-025", "P-028", "OP05-010", "ST01-006"];
const OPP_DECK: CardInstance[] = Array.from({ length: 15 }, (_, i) =>
  makeCard({ instanceId: `p1-deck-${i}`, cardId: "hidden", zone: "DECK", controller: 1 }),
);

function baseState(activePlayerIndex: 0 | 1) {
  return {
    myIndex: 0 as const,
    turn: { ...TURN, activePlayerIndex },
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({ instanceId: "p0-leader", cardId: "OP01-001", zone: "LEADER", controller: 0 }),
        hand: ME_HAND,
        deck: ME_DECK,
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 4, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({ instanceId: "p1-leader", cardId: "OP01-060", zone: "LEADER", controller: 1 }),
        hand: OPP_HAND,
        deck: OPP_DECK,
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donCostArea: makeDonStack({ count: 4, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p1-don-deck" }),
      }),
    ] as [ReturnType<typeof playerSlot>, ReturnType<typeof playerSlot>],
  };
}

const myLook: GameEvent = {
  type: "DECK_TOP_LOOKED",
  playerIndex: 0,
  timestamp: 1,
  payload: {
    count: 5,
    cards: ME_DECK.slice(0, 5).map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
  },
};

export const lookTopFiveScenario: Scenario = {
  id: "look-top-5",
  title: "Look at top 5 (you)",
  category: "draws",
  description:
    "The top card flips on the deck and five cards fan into the center face-up. The pick joins the end of the hand; the rest flip face-down and go to the bottom of the deck.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-010", "OP11-003", ...TOP_IDS],
  initialState: baseState(0),
  script: [
    { type: "event", event: myLook, delayMs: 300 },
    { type: "wait", ms: 1800 },
    {
      type: "event",
      event: {
        type: "CARD_DRAWN",
        playerIndex: 0,
        timestamp: 2,
        payload: { cardId: TOP_IDS[1], cardInstanceId: "p0-hand-new", source: "search" },
      },
      batch: [
        {
          type: "CARDS_PLACED_IN_DECK",
          playerIndex: 0,
          timestamp: 3,
          payload: { count: 4, position: "BOTTOM" },
        },
      ],
    },
  ],
};

const oppLook: GameEvent = {
  type: "DECK_TOP_LOOKED",
  playerIndex: 1,
  timestamp: 1,
  payload: {
    count: 5,
    cards: Array.from({ length: 5 }, () => ({ instanceId: "hidden", cardId: "hidden" })),
  },
};

function oppTrash(index: number, timestamp: number): GameEvent {
  return {
    type: "CARD_TRASHED",
    playerIndex: 1,
    timestamp,
    payload: {
      cardInstanceId: `p1-deck-${index}`,
      newCardInstanceId: `p1-trash-${index}`,
      cardId: OPP_TOP_IDS[index - 1],
      reason: "search_trash",
    },
  };
}

export const opponentLookTopFiveScenario: Scenario = {
  id: "opponent-look-top-5",
  title: "Look at top 5 (opponent)",
  category: "draws",
  description:
    "The opponent's five fan face-down like a hand. Their public pick rises, flips up, flips back down and joins their hand; the rest flip face-up and go to their trash.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-010", "OP11-003", ...OPP_TOP_IDS],
  initialState: baseState(1),
  promptRespondingPlayer: 1,
  script: [
    { type: "event", event: oppLook, delayMs: 300 },
    { type: "wait", ms: 1800 },
    {
      type: "event",
      event: {
        type: "CARDS_REVEALED",
        playerIndex: 1,
        timestamp: 2,
        payload: {
          cards: [{ instanceId: "p1-deck-0", cardId: OPP_TOP_IDS[4] }],
          source: "search",
          visibility: "BOTH",
        },
      },
      batch: [
        {
          type: "CARD_DRAWN",
          playerIndex: 1,
          timestamp: 3,
          payload: { cardId: "hidden", cardInstanceId: "hidden", source: "search" },
        },
        // The sandbox deals the hidden pick off the top, so the rest are 1–4.
        oppTrash(1, 4),
        oppTrash(2, 5),
        oppTrash(3, 6),
        oppTrash(4, 7),
      ],
    },
  ],
};
