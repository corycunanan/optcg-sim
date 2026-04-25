// Spectator scenario: an attacker rests to declare an attack on the
// opponent's lone Character; the defender takes lethal damage and is K.O.'d.
// Exercises the `kind: "ko"` flight branch in `card-animation-layer` — the
// shrink preset plays at the source zone before the trash flight starts.

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

const DEFENDER: CardInstance = makeCard({
  instanceId: "p1-char-defender",
  cardId: "OP01-010",
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

const koDefender: GameEvent = {
  type: "CARD_KO",
  playerIndex: 1,
  payload: {
    cardInstanceId: DEFENDER.instanceId,
    cardId: DEFENDER.cardId,
    cause: "BATTLE",
    causingController: 0,
    preKO_donCount: 0,
  },
  timestamp: 2,
};

export const characterKoedByDamageScenario: Scenario = {
  id: "character-koed-by-damage",
  title: "Character K.O.'d by damage",
  category: "ko",
  description:
    "An attacker rests and the opponent's Character takes lethal damage in combat. The defender plays the kind: \"ko\" flight — shrink preset at the source slot, then a face-up trash flight to the trash pile.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP11-003", "OP01-060", "OP01-010"],
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
        donCostArea: makeDonStack({ count: 4, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 5, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        characters: [DEFENDER, null, null, null, null],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: restAttacker },
    { type: "wait", ms: 400 },
    { type: "event", event: koDefender },
  ],
};
