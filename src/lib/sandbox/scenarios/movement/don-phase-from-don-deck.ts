// Spectator scenario: DON!! Phase places 2 DON!! from the DON!! deck (under
// the Life zone) into the cost area as a staggered token flight.

import type { GameEvent, TurnState } from "@shared/game-types";
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

const PLAYER_LEADER = makeCard({
  instanceId: "p0-leader",
  cardId: "OP01-001",
  zone: "LEADER",
  controller: 0,
});

const donEvent: GameEvent = {
  type: "DON_PLACED_ON_FIELD",
  playerIndex: 0,
  payload: { count: 2, donInstanceIds: ["p0-don-deck-1", "p0-don-deck-2"] },
  timestamp: 1,
};

const opponentDonEvent: GameEvent = {
  type: "DON_PLACED_ON_FIELD",
  playerIndex: 1,
  payload: { count: 2, donInstanceIds: ["p1-don-deck-1", "p1-don-deck-2"] },
  timestamp: 2,
};

export const donPhaseFromDonDeckScenario: Scenario = {
  id: "don-phase-from-don-deck",
  title: "DON!! Phase from DON!! deck",
  category: "movement",
  description:
    "DON_PLACED_ON_FIELD places 2 DON!! for each player. The top DON!! flips on the face-down DON!! deck under Life, the second comes off face-up, and both land in their cost-area slots 90ms apart. The opponent's step plays next.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-060"],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: PLAYER_LEADER,
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 2, prefix: "p0-don" }),
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
        donCostArea: makeDonStack({ count: 4, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: donEvent },
    { type: "event", event: opponentDonEvent },
  ],
};
