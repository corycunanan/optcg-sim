// Spectator scenario: a DON!! -3 cost returns 2 DON!! from the cost area and
// 1 attached to the Leader to the DON!! deck pile under the Life zone.

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
  attachedDon: makeDonStack({
    count: 1,
    prefix: "p0-leader-don",
    attachedTo: "p0-leader",
  }),
});

const donEvent: GameEvent = {
  type: "DON_DETACHED",
  playerIndex: 0,
  payload: {
    count: 3,
    to: "DON_DECK",
    fromCostArea: 2,
    sources: [{ cardInstanceId: "p0-leader", count: 1 }],
    donInstanceIds: ["p0-don-4", "p0-don-5", "p0-leader-don-1"],
  },
  timestamp: 1,
};

export const donReturnToDonDeckScenario: Scenario = {
  id: "don-return-to-don-deck",
  title: "DON!! -3 return to DON!! deck",
  category: "movement",
  description:
    "DON!! -3 returns 2 DON!! from the cost area and 1 from under the Leader. Each flips face-down where it is, then flies into the DON!! deck pile under Life, which pops with +3.",
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
        donCostArea: makeDonStack({ count: 5, prefix: "p0-don" }),
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
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donCostArea: makeDonStack({ count: 4, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [{ type: "event", event: donEvent }],
};
