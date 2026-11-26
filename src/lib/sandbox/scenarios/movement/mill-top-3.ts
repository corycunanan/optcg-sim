// Spectator scenario (OPT-1059): the top 3 cards of the deck are trashed in
// one event. Only the top card flips on the deck; the two under it travel
// already face-up, 70ms apart, and the trash pops once with +3.

import type { GameEvent, TurnState } from "@shared/game-types";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 2,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const MILLED = ["OP01-025", "OP01-030", "OP02-033"];

const mill: GameEvent = {
  type: "CARD_TRASHED",
  playerIndex: 0,
  payload: {
    count: MILLED.length,
    reason: "mill",
    from: "DECK",
    cards: MILLED.map((cardId, i) => ({
      instanceId: `p0-trash-${i + 1}`,
      cardId,
    })),
  },
  timestamp: 1,
};

export const millTopThreeScenario: Scenario = {
  id: "mill-top-3",
  title: "Trash top 3 of deck",
  category: "movement",
  description:
    "Three cards are trashed from the top of the deck in one event. The top card flips on the deck, the two under it come off face-up 70ms apart, and the trash pops once with +3.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-010", ...MILLED],
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
        deck: [
          ...MILLED.map((cardId, i) =>
            makeCard({
              instanceId: `p0-deck-${i + 1}`,
              cardId,
              zone: "DECK",
              controller: 0,
            }),
          ),
          ...Array.from({ length: 7 }, (_, i) =>
            makeCard({
              instanceId: `p0-deck-${i + 4}`,
              cardId: "OP01-010",
              zone: "DECK",
              controller: 0,
            }),
          ),
        ],
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 3, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p0-don-deck" }),
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
  script: [{ type: "event", event: mill }],
};
