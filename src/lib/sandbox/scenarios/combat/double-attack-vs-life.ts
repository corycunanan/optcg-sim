// Spectator scenario: a Character with [Double Attack] attacks the
// opponent's Leader and deals two damages, surfacing as two distinct life
// → hand flights. Uses two CARD_ADDED_TO_HAND_FROM_LIFE events with a long
// gap between them so the second flip reads as a separate arc rather than
// fanning into the first via the per-batch stagger in
// `card-animation-layer`.

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
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

const ATTACKER: CardInstance = makeCard({
  instanceId: "p0-char-da",
  cardId: "P-028",
  zone: "CHARACTER",
  controller: 0,
  turnPlayed: 1,
});

const restAttacker: GameEvent = {
  type: "CARD_STATE_CHANGED",
  playerIndex: 0,
  payload: { cardInstanceId: ATTACKER.instanceId, newState: "RESTED" },
  timestamp: 1,
};

const lifeFlipFirst: GameEvent = {
  type: "CARD_ADDED_TO_HAND_FROM_LIFE",
  playerIndex: 1,
  payload: { cardId: "OP01-060", cardInstanceId: "p1-life-1" },
  timestamp: 2,
};

const lifeFlipSecond: GameEvent = {
  type: "CARD_ADDED_TO_HAND_FROM_LIFE",
  playerIndex: 1,
  payload: { cardId: "OP01-060", cardInstanceId: "p1-life-2" },
  timestamp: 3,
};

export const doubleAttackVsLifeScenario: Scenario = {
  id: "double-attack-vs-life",
  title: "Double Attack vs. Life",
  category: "combat",
  description:
    "A Character with [Double Attack] strikes the opponent's Leader for two damages. Two life → hand arcs play sequentially with a clear gap between them, so the second flip reads as its own animation rather than batching into the first.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "P-028", "OP01-060"],
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
        characters: [ATTACKER, null, null, null, null],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 5, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 4, prefix: "p0-don-deck" }),
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
    { type: "event", event: restAttacker },
    { type: "wait", ms: 350 },
    { type: "event", event: lifeFlipFirst },
    { type: "wait", ms: 700 },
    { type: "event", event: lifeFlipSecond },
  ],
};
