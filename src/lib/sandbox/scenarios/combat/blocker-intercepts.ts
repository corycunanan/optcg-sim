// Spectator scenario: an attack is intercepted by an opponent's [Blocker].
// The attacker rests, the blocker rests to redirect, and then the blocker is
// K.O.'d by the attacker's higher power. Exercises the rest-state visual on
// two cards in sequence and the `kind: "ko"` flight branch in
// `card-animation-layer`. The attacker's own life is unaffected — the
// blocker absorbs the battle in its place.

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
  instanceId: "p0-char-attacker",
  cardId: "OP11-003",
  zone: "CHARACTER",
  controller: 0,
  turnPlayed: 1,
});

const BLOCKER: CardInstance = makeCard({
  instanceId: "p1-char-blocker",
  cardId: "ST01-006",
  zone: "CHARACTER",
  controller: 1,
  turnPlayed: 1,
});

const restAttacker: GameEvent = {
  type: "CARD_STATE_CHANGED",
  playerIndex: 0,
  payload: { cardInstanceId: ATTACKER.instanceId, newState: "RESTED" },
  timestamp: 1,
};

const restBlocker: GameEvent = {
  type: "CARD_STATE_CHANGED",
  playerIndex: 1,
  payload: { cardInstanceId: BLOCKER.instanceId, newState: "RESTED" },
  timestamp: 2,
};

const koBlocker: GameEvent = {
  type: "CARD_KO",
  playerIndex: 1,
  payload: {
    cardInstanceId: BLOCKER.instanceId,
    cardId: BLOCKER.cardId,
    cause: "BATTLE",
    causingController: 0,
    preKO_donCount: 0,
  },
  timestamp: 3,
};

export const blockerInterceptsScenario: Scenario = {
  id: "blocker-intercepts",
  title: "Blocker Intercepts",
  category: "combat",
  description:
    "An attacker rests to declare an attack; the opponent's [Blocker] rests to intercept; the blocker is K.O.'d by the higher-power attacker. Exercises two sequential rest visuals plus the kind: \"ko\" flight branch in card-animation-layer.",
  inputMode: "spectator",
  cardsUsed: ["OP11-003", "ST01-006", "OP01-060"],
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
        characters: [BLOCKER, null, null, null, null],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: restAttacker },
    { type: "wait", ms: 250 },
    { type: "event", event: restBlocker },
    { type: "wait", ms: 350 },
    { type: "event", event: koBlocker },
  ],
};
