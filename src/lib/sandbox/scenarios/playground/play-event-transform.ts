// Playground scenario: the user plays an Event through the real engine so
// CARD_PLAYED + EVENT_ACTIVATED_FROM_HAND arrive in one accepted update. This
// is the canonical OPT-465 VQA path for spotlight dwell → source fizzle →
// trash pile pop + floating +1 receipt.

import type { CardInstance, TurnState } from "@shared/game-types";
import { makeCard, makeDonStack, makeLifeStack, playerSlot } from "../helpers";
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

const EVENT_TO_PLAY: CardInstance = makeCard({
  instanceId: "p0-hand-event-transform",
  cardId: "OP01-030",
  zone: "HAND",
  controller: 0,
});

export const playEventTransformScenario: Scenario = {
  id: "play-event-transform",
  title: "Play Event: Spotlight to Trash",
  category: "playground",
  description:
    "Drag the Event to your field. The real engine spotlights it, then it dissolves in place and materializes as one aggregated receipt on the trash pile. Reset to replay.",
  mode: "playground",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP01-030", "OP01-060"],
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
        hand: [EVENT_TO_PLAY],
        deck: Array.from({ length: 10 }, (_, index) =>
          makeCard({
            instanceId: `p0-deck-${index + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          })
        ),
        life: makeLifeStack({
          count: 5,
          cardId: "OP01-001",
          prefix: "p0-life",
        }),
        donCostArea: makeDonStack({ count: 1, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 9, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-060",
          zone: "LEADER",
          controller: 1,
        }),
        deck: Array.from({ length: 10 }, (_, index) =>
          makeCard({
            instanceId: `p1-deck-${index + 1}`,
            cardId: "OP02-060",
            zone: "DECK",
            controller: 1,
          })
        ),
        life: makeLifeStack({
          count: 5,
          cardId: "OP01-060",
          prefix: "p1-life",
        }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
};
