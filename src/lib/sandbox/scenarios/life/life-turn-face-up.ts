// Spectator scenario (OPT-1059): the top Life card turns face-up, then back
// face-down. Each turn is the shared card flip, played in place on the pile.

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

const turn = (face: "UP" | "DOWN", timestamp: number): GameEvent => ({
  type: "LIFE_CARD_FACE_CHANGED",
  playerIndex: 0,
  payload: { face },
  timestamp,
});

export const lifeTurnFaceUpScenario: Scenario = {
  id: "life-turn-face-up",
  title: "Turn a Life card over",
  category: "life",
  description:
    "The top Life card turns face-up with the shared flip, in place on the pile, then turns back face-down.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-025"],
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
        life: makeLifeStack({ count: 4, cardId: "OP01-025", prefix: "p0-life" }),
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
    { type: "event", event: turn("UP", 1) },
    { type: "wait", ms: 1200 },
    { type: "event", event: turn("DOWN", 2) },
  ],
};
