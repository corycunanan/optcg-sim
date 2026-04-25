// Spectator scenario: a single CARD_DRAWN event. The simplest case for the
// deck → hand flight in `card-animation-layer` — exercises the path without
// the multi-card batch stagger that `draw-2` covers.

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
];

const ME_DECK_TOP: CardInstance = makeCard({
  instanceId: "p0-deck-top",
  cardId: "OP11-003",
  zone: "DECK",
  controller: 0,
});

const ME_DECK_REST: CardInstance[] = Array.from({ length: 9 }, (_, i) =>
  makeCard({
    instanceId: `p0-deck-${i + 2}`,
    cardId: "OP01-010",
    zone: "DECK",
    controller: 0,
  }),
);

const ME_DECK = [ME_DECK_TOP, ...ME_DECK_REST];

const drawEvent: GameEvent = {
  type: "CARD_DRAWN",
  playerIndex: 0,
  payload: {
    cardId: ME_DECK_TOP.cardId,
    cardInstanceId: ME_DECK_TOP.instanceId,
    source: "DECK",
  },
  timestamp: 1,
};

export const drawOneScenario: Scenario = {
  id: "draw-1",
  title: "Draw 1",
  category: "draws",
  description:
    "A single CARD_DRAWN event. Exercises the deck → hand flight in card-animation-layer and the hand-fan reflow in use-hand-animation-state without the per-batch stagger that draw-2 introduces.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP11-003"],
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
  script: [{ type: "event", event: drawEvent }],
};
