// Spectator scenario: a single DON_GIVEN_TO_CARD event with `count: 3` fans
// out into three staggered token flights via `eventToTransitions`. Verifies
// the multi-DON fan-out — three distinct arrivals separated by `STAGGER_MS`
// (60ms), not one merged token.

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

const TARGET_CHARACTER = makeCard({
  instanceId: "p0-char-shanks",
  cardId: "OP13-028",
  zone: "CHARACTER",
  controller: 0,
});

const attachEvent: GameEvent = {
  type: "DON_GIVEN_TO_CARD",
  playerIndex: 0,
  payload: {
    targetInstanceId: TARGET_CHARACTER.instanceId,
    count: 3,
  },
  timestamp: 1,
};

export const attachThreeDonStaggeredScenario: Scenario = {
  id: "attach-3-don-staggered",
  title: "Attach 3 DON (Staggered)",
  category: "movement",
  description:
    "A DON_GIVEN_TO_CARD event with count: 3. The fan-out branch in eventToTransitions emits three transitions separated by 60ms — three distinct DON arrivals, not one merged token.",
  inputMode: "spectator",
  cardsUsed: ["OP01-031", "OP13-028"],
  initialState: {
    myIndex: 0,
    turn: TURN,
    players: [
      // Green leader + Shanks character: a thematic pairing that justifies
      // a 3-DON dump in one tick (Shanks is cost 10, so this is a credible
      // mid-turn buff visual).
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader",
          cardId: "OP01-031",
          zone: "LEADER",
          controller: 0,
        }),
        characters: [TARGET_CHARACTER, null, null, null, null],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-036",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-031", prefix: "p0-life" }),
        // 5 active DON in cost area: 3 fly to Shanks, 2 remain — the
        // shrinking pool reads clearly against the multi-attach.
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
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [{ type: "event", event: attachEvent }],
};
