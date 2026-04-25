// Interactive scenario: an ARRANGE_TOP_CARDS prompt over the deck's top 4
// cards with `canSendToBottom: true` and no `validTargets`. Distinct from
// `peek-top-3`, which constrains the kept card to a subset and exposes the
// "Keep None" / Skip path. Here every peeked card is a valid keep, so the
// modal hides Skip and any of the four IDs satisfies the predicate.

import type { CardInstance, TurnState } from "@shared/game-types";
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

const PEEK_1 = makeCard({
  instanceId: "p0-deck-top-1",
  cardId: "OP01-010",
  zone: "DECK",
  controller: 0,
});
const PEEK_2 = makeCard({
  instanceId: "p0-deck-top-2",
  cardId: "OP01-025",
  zone: "DECK",
  controller: 0,
});
const PEEK_3 = makeCard({
  instanceId: "p0-deck-top-3",
  cardId: "OP05-010",
  zone: "DECK",
  controller: 0,
});
const PEEK_4 = makeCard({
  instanceId: "p0-deck-top-4",
  cardId: "OP01-030",
  zone: "DECK",
  controller: 0,
});

const PEEK_IDS: readonly string[] = [
  PEEK_1.instanceId,
  PEEK_2.instanceId,
  PEEK_3.instanceId,
  PEEK_4.instanceId,
];

const ME_DECK_REST: CardInstance[] = Array.from({ length: 6 }, (_, i) =>
  makeCard({
    instanceId: `p0-deck-${i + 5}`,
    cardId: "OP11-003",
    zone: "DECK",
    controller: 0,
  }),
);

export const arrangeTopFourScenario: Scenario = {
  id: "arrange-top-4",
  title: "Arrange Top 4",
  category: "prompts",
  description:
    "An ARRANGE_TOP_CARDS prompt over the top 4 cards. Every peeked card is a valid keep — pick any one, then place the rest at the bottom (canSendToBottom: true). Sister to peek-top-3, which restricts the kept set and exposes the Skip path.",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-010", "OP01-025", "OP05-010", "OP01-030"],
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
          makeCard({ instanceId: "p0-hand-1", cardId: "OP01-010", zone: "HAND", controller: 0 }),
          makeCard({ instanceId: "p0-hand-2", cardId: "ST01-006", zone: "HAND", controller: 0 }),
        ],
        deck: [PEEK_1, PEEK_2, PEEK_3, PEEK_4, ...ME_DECK_REST],
        life: makeLifeStack({ count: 5, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 2, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 8, prefix: "p0-don-deck" }),
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
    {
      type: "prompt",
      prompt: {
        promptType: "ARRANGE_TOP_CARDS",
        cards: [PEEK_1, PEEK_2, PEEK_3, PEEK_4],
        effectDescription:
          "Look at the top 4 cards of your deck. Add 1 to your hand, then place the rest at the bottom of your deck in any order.",
        canSendToBottom: true,
      },
    },
  ],
  expectedResponse: {
    allowedActionTypes: ["ARRANGE_TOP_CARDS"],
    // Without `validTargets`, the modal hides Skip — `keptCardInstanceId`
    // must resolve to one of the four peeked IDs. `destination` defaults to
    // "bottom" given canSendToBottom: true; accept either to stay forgiving.
    predicate: (action) =>
      action.type === "ARRANGE_TOP_CARDS" &&
      PEEK_IDS.includes(action.keptCardInstanceId) &&
      (action.destination === "top" || action.destination === "bottom"),
    hint: "Pick one of the top 4 to keep — then arrange the rest at the bottom",
  },
};
