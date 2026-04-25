// Spectator scenario: a Character with [Rush] is played from hand and
// attacks on the same turn it arrived. Exercises the hand → character
// flight, the summon-arrival pop in `use-field-arrivals`, and then the
// rest-state visual + life flip — all chained back-to-back so the
// "summoning sickness" exemption that defines [Rush] is the visible story.

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

const RUSH_CHARACTER: CardInstance = makeCard({
  instanceId: "p0-hand-rush",
  cardId: "OP01-025",
  zone: "HAND",
  controller: 0,
});

const playRush: GameEvent = {
  type: "CARD_PLAYED",
  playerIndex: 0,
  payload: {
    cardId: RUSH_CHARACTER.cardId,
    cardInstanceId: RUSH_CHARACTER.instanceId,
    zone: "CHARACTER",
    source: "HAND",
  },
  timestamp: 1,
};

const restRush: GameEvent = {
  type: "CARD_STATE_CHANGED",
  playerIndex: 0,
  payload: { cardInstanceId: RUSH_CHARACTER.instanceId, newState: "RESTED" },
  timestamp: 2,
};

const lifeFlip: GameEvent = {
  type: "CARD_ADDED_TO_HAND_FROM_LIFE",
  playerIndex: 1,
  payload: { cardId: "OP01-060", cardInstanceId: "p1-life-1" },
  timestamp: 3,
};

export const rushAttackScenario: Scenario = {
  id: "rush-attack",
  title: "Rush Attack",
  category: "combat",
  description:
    "A Character with [Rush] is played from hand and attacks on the same turn. The summon flight + entry pop play first, then the just-arrived Character rests to attack and a life flips into the opponent's hand — back-to-back, demonstrating the summoning-sickness exemption.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-025", "OP01-060"],
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
        hand: [
          RUSH_CHARACTER,
          makeCard({ instanceId: "p0-hand-2", cardId: "OP01-010", zone: "HAND", controller: 0 }),
          makeCard({ instanceId: "p0-hand-3", cardId: "OP11-003", zone: "HAND", controller: 0 }),
        ],
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
    { type: "event", event: playRush },
    { type: "wait", ms: 700 },
    { type: "event", event: restRush },
    { type: "wait", ms: 300 },
    { type: "event", event: lifeFlip },
  ],
};
