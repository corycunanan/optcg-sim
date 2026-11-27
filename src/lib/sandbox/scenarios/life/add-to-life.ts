// Spectator scenario (OPT-1059): a Character is added to the top of its
// owner's Life face-down. It flips on the field first, then travels to the
// top of Life, and the Life pile pops with +1. A second Character is then
// added face-up and travels as it is.

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

function addToLife(
  instanceId: string,
  cardId: string,
  face: "UP" | "DOWN",
  timestamp: number,
): GameEvent {
  return {
    type: "CARD_ADDED_TO_LIFE",
    playerIndex: 0,
    payload: {
      cardInstanceId: instanceId,
      newCardInstanceId: `${instanceId}-life`,
      cardId,
      sourceZone: "CHARACTER",
      movementCause: "EFFECT",
      face,
    },
    timestamp,
  };
}

export const addToLifeScenario: Scenario = {
  id: "add-to-life",
  title: "Add a Character to Life",
  category: "life",
  description:
    "A Character goes to the top of Life face-down: it flips on the field, then travels, and Life pops with +1. A second Character is added face-up and travels as it is.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-025", "OP02-033"],
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
        characters: [
          makeCard({
            instanceId: "p0-char-1",
            cardId: "OP01-025",
            zone: "CHARACTER",
            controller: 0,
          }),
          null,
          makeCard({
            instanceId: "p0-char-3",
            cardId: "OP02-033",
            zone: "CHARACTER",
            controller: 0,
          }),
          null,
          null,
        ],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 3, cardId: "OP01-001", prefix: "p0-life" }),
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
  script: [
    { type: "event", event: addToLife("p0-char-1", "OP01-025", "DOWN", 1) },
    { type: "wait", ms: 1200 },
    { type: "event", event: addToLife("p0-char-3", "OP02-033", "UP", 2) },
  ],
};
