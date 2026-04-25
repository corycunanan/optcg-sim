// Interactive scenario: a SELECT_TARGET prompt over three opponent
// Characters. Verifies the modal renders, valid targets get the highlight
// ring, the input gate (OPT-290) drops non-SELECT_TARGET actions and any
// SELECT_TARGET response that doesn't pick one of the three valid IDs, and
// that resolvePrompt advances the runner to "ended".

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

const OPP_CHAR_1 = makeCard({
  instanceId: "p1-char-1",
  cardId: "OP01-010",
  zone: "CHARACTER",
  controller: 1,
});
const OPP_CHAR_2 = makeCard({
  instanceId: "p1-char-2",
  cardId: "ST01-006",
  zone: "CHARACTER",
  controller: 1,
});
const OPP_CHAR_3 = makeCard({
  instanceId: "p1-char-3",
  cardId: "OP05-010",
  zone: "CHARACTER",
  controller: 1,
});

const VALID_TARGET_IDS: readonly string[] = [
  OPP_CHAR_1.instanceId,
  OPP_CHAR_2.instanceId,
  OPP_CHAR_3.instanceId,
];

export const selectTargetScenario: Scenario = {
  id: "select-target",
  title: "Select Target",
  category: "prompts",
  description:
    "A SELECT_TARGET prompt over three opponent Characters. Demonstrates the input gate: only a SELECT_TARGET action whose chosen instanceId belongs to the valid set advances playback past the prompt.",
  inputMode: "interactive",
  cardsUsed: ["OP05-010", "ST01-006", "OP01-010"],
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
          makeCard({ instanceId: "p0-hand-2", cardId: "OP01-025", zone: "HAND", controller: 0 }),
          makeCard({ instanceId: "p0-hand-3", cardId: "OP05-010", zone: "HAND", controller: 0 }),
        ],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP11-003",
            zone: "DECK",
            controller: 0,
          }),
        ),
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
        characters: [OPP_CHAR_1, OPP_CHAR_2, OPP_CHAR_3, null, null],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donCostArea: makeDonStack({ count: 4, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 6, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    {
      type: "prompt",
      prompt: {
        promptType: "SELECT_TARGET",
        cards: [OPP_CHAR_1, OPP_CHAR_2, OPP_CHAR_3],
        validTargets: [...VALID_TARGET_IDS],
        effectDescription: "Select 1 of opponent's Characters",
        countMin: 1,
        countMax: 1,
        ctaLabel: "Confirm",
      },
    },
  ],
  expectedResponse: {
    allowedActionTypes: ["SELECT_TARGET"],
    predicate: (action) =>
      action.type === "SELECT_TARGET" &&
      action.selectedInstanceIds.length === 1 &&
      VALID_TARGET_IDS.includes(action.selectedInstanceIds[0]),
    hint: "Select an opponent's Character to continue",
  },
};
