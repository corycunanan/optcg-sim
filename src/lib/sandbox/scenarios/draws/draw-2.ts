// Spectator scenario: two CARD_DRAWN events fired ~60ms apart so
// `useCardTransitions` produces two distinct deck → hand flights, exercising
// the per-batch stagger (`STAGGER_MS`) and the hand fan reflow in
// `useHandAnimationState`.

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 1,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const ME_HAND: CardInstance[] = [
  makeCard({ instanceId: "p0-hand-1", cardId: "OP01-010", zone: "HAND", controller: 0 }),
  makeCard({ instanceId: "p0-hand-2", cardId: "ST01-006", zone: "HAND", controller: 0 }),
  makeCard({ instanceId: "p0-hand-3", cardId: "OP05-010", zone: "HAND", controller: 0 }),
  makeCard({ instanceId: "p0-hand-4", cardId: "OP01-025", zone: "HAND", controller: 0 }),
  makeCard({ instanceId: "p0-hand-5", cardId: "OP11-003", zone: "HAND", controller: 0 }),
];

// Top of deck — these are what the two CARD_DRAWN events resolve. Distinct
// cardIds so the two flights have visually different art.
const ME_DECK_TOP: CardInstance[] = [
  makeCard({ instanceId: "p0-deck-top-1", cardId: "OP01-030", zone: "DECK", controller: 0 }),
  makeCard({ instanceId: "p0-deck-top-2", cardId: "P-028", zone: "DECK", controller: 0 }),
];

const ME_DECK_REST: CardInstance[] = Array.from({ length: 8 }, (_, i) =>
  makeCard({
    instanceId: `p0-deck-${i + 3}`,
    cardId: "OP01-010",
    zone: "DECK",
    controller: 0,
  }),
);

const ME_DECK = [...ME_DECK_TOP, ...ME_DECK_REST];

function drawEvent(card: CardInstance, timestamp: number): GameEvent {
  return {
    type: "CARD_DRAWN",
    playerIndex: 0,
    payload: {
      cardId: card.cardId,
      cardInstanceId: card.instanceId,
      source: "DECK",
    },
    timestamp,
  };
}

export const drawTwoScenario: Scenario = {
  id: "draw-2",
  title: "Draw 2",
  category: "draws",
  description:
    "Two CARD_DRAWN events fire ~60ms apart, exercising the deck → hand flight in card-animation-layer and the hand fan reflow in use-hand-animation-state.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-030", "P-028"],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader",
          cardId: "OP01-001",
          zone: "LEADER",
          controller: 0,
        }),
        hand: ME_HAND,
        deck: ME_DECK,
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 1, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 9, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: drawEvent(ME_DECK_TOP[0], 1) },
    { type: "wait", ms: 60 },
    { type: "event", event: drawEvent(ME_DECK_TOP[1], 2) },
  ],
};
