// Spectator scenario: a single DON_GIVEN_TO_CARD event attaches one DON to a
// character on the field. Exercises the `kind: "don-attach"` branch in
// `eventToTransitions` — a token flies from the DON pool to the target card
// and the attached-DON badge updates.

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
  instanceId: "p0-char-1",
  cardId: "OP01-025",
  zone: "CHARACTER",
  controller: 0,
});

const attachEvent: GameEvent = {
  type: "DON_GIVEN_TO_CARD",
  playerIndex: 0,
  payload: {
    targetInstanceId: TARGET_CHARACTER.instanceId,
    count: 1,
  },
  timestamp: 1,
};

export const attachOneDonScenario: Scenario = {
  id: "attach-1-don",
  title: "Attach 1 DON",
  category: "movement",
  description:
    "A single DON_GIVEN_TO_CARD event attaches one DON to a Character. Exercises the don-attach token flight in card-animation-layer and the attached-DON badge update on field-card.",
  inputMode: "spectator",
  cardsUsed: ["OP01-001", "OP01-025"],
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
        characters: [TARGET_CHARACTER, null, null, null, null],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        // 3 active DON in cost area: one will fly to the character, the
        // remaining two stay visible in the pool so the badge update reads
        // clearly against a non-empty source.
        donCostArea: makeDonStack({ count: 3, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 7, prefix: "p0-don-deck" }),
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
