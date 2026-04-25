// Interactive scenario: an ARRANGE_TOP_CARDS prompt over the deck's top 3
// cards. Drives the look-and-arrange pattern — pick one to add to hand (or
// skip), then place the remainder on the top or bottom of the deck. The
// predicate is permissive: any ARRANGE_TOP_CARDS whose `keptCardInstanceId`
// is empty (skip) or one of the three peeked IDs advances the runner.

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
  cardId: "OP05-010",
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
  cardId: "OP01-030",
  zone: "DECK",
  controller: 0,
});

const PEEK_IDS: readonly string[] = [
  PEEK_1.instanceId,
  PEEK_2.instanceId,
  PEEK_3.instanceId,
];

const ME_DECK_REST: CardInstance[] = Array.from({ length: 7 }, (_, i) =>
  makeCard({
    instanceId: `p0-deck-${i + 4}`,
    cardId: "OP01-010",
    zone: "DECK",
    controller: 0,
  }),
);

export const peekTopThreeScenario: Scenario = {
  id: "peek-top-3",
  title: "Peek Top 3",
  category: "draws",
  description:
    "An ARRANGE_TOP_CARDS prompt over the top 3 cards. Pick one to add to hand (or skip), then place the rest on top or bottom — the look-and-arrange pattern shared by Sabaody, Perona, and similar effects.",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP05-010", "OP01-025", "OP01-030"],
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
          makeCard({ instanceId: "p0-hand-3", cardId: "OP11-003", zone: "HAND", controller: 0 }),
        ],
        deck: [PEEK_1, PEEK_2, PEEK_3, ...ME_DECK_REST],
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
        cards: [PEEK_1, PEEK_2, PEEK_3],
        effectDescription:
          "Look at the top 3 cards of your deck. Add up to 1 to your hand, then arrange the rest.",
        canSendToBottom: true,
        validTargets: [...PEEK_IDS],
      },
    },
  ],
  expectedResponse: {
    allowedActionTypes: ["ARRANGE_TOP_CARDS"],
    // The modal sends `keptCardInstanceId: ""` for "Skip" and one of the
    // peeked IDs for "Add to hand". `destination` is whichever button the
    // user pressed in step 2. Either path is a valid arrangement.
    predicate: (action) =>
      action.type === "ARRANGE_TOP_CARDS" &&
      (action.keptCardInstanceId === "" ||
        PEEK_IDS.includes(action.keptCardInstanceId)) &&
      (action.destination === "top" || action.destination === "bottom"),
    hint: "Pick one of the top 3 to keep — then arrange the rest",
  },
};
