// Spectator scenario: a Character attacks the opponent's Leader unopposed.
// The attacker rests, then the top Life card flips up to the opponent's hand
// — exercising the rest-state visual and the life → hand flight in
// `card-animation-layer`. No battle context is set on `turn`: the sandbox
// renders only the visible deltas, and the BattleInfo banner is reserved for
// scenarios where the player needs to see active phase metadata.

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
  attachedDon: [
    { instanceId: "p0-don-attached-1", state: "ACTIVE", attachedTo: "p0-char-attacker" },
  ],
  turnPlayed: 1,
});

const restAttacker: GameEvent = {
  type: "CARD_STATE_CHANGED",
  playerIndex: 0,
  payload: { cardInstanceId: ATTACKER.instanceId, newState: "RESTED" },
  timestamp: 1,
};

const lifeFlip: GameEvent = {
  type: "CARD_ADDED_TO_HAND_FROM_LIFE",
  playerIndex: 1,
  payload: { cardId: "OP01-060", cardInstanceId: "p1-life-1" },
  timestamp: 2,
};

export const attackNoBlockerScenario: Scenario = {
  id: "attack-no-blocker",
  title: "Attack (no blocker)",
  category: "combat",
  description:
    "An active Character attacks the opponent's Leader with no blocker and no counter. The attacker rests and the top Life card flips into the opponent's hand. Exercises the rest-state visual and the life → hand flight in card-animation-layer.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP11-003", "OP01-060"],
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
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: restAttacker },
    { type: "wait", ms: 200 },
    { type: "event", event: lifeFlip },
  ],
};
