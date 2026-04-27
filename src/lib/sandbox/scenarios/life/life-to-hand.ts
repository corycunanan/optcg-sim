// Spectator scenario: a single life damage flips the top life card up into
// the controller's hand. Pure isolation of the life → hand flight in
// `card-animation-layer` — no attacker, no rest, no battle context. Sister
// scenario to life-to-trash, which routes the same source zone to a
// different destination.

import type { GameEvent, TurnState } from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
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

const lifeToHand: GameEvent = {
  type: "CARD_ADDED_TO_HAND_FROM_LIFE",
  playerIndex: 0,
  payload: { cardId: "OP01-001", cardInstanceId: "p0-life-1" },
  timestamp: 1,
};

export const lifeToHandScenario: Scenario = {
  id: "life-to-hand",
  title: "Life damage to hand",
  category: "life",
  description:
    "A single life damage flips the top Life card from the life zone into the controller's hand. Isolated life → hand flight with no preceding rest or attacker — sister scenario to life-to-trash, which routes the same zone to the trash pile.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060"],
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
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
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
  script: [
    { type: "event", event: lifeToHand },
  ],
};
