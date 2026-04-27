// Interactive scenario: a PLAYER_CHOICE prompt with three labeled branches.
// The modal renders one button per choice; clicking any one emits a
// PLAYER_CHOICE action with that branch's `id`. The predicate accepts any of
// the three.

import type { TurnState } from "@shared/game-types";
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

const CHOICES = [
  { id: "draw_2", label: "Draw 2 cards" },
  { id: "give_don", label: "Give 1 DON!! to your Leader" },
  { id: "return_char", label: "Return 1 of opponent's Characters to its owner's hand" },
] as const;

const CHOICE_IDS: readonly string[] = CHOICES.map((c) => c.id);

export const playerChoiceThreeOptionsScenario: Scenario = {
  id: "player-choice-3-options",
  title: "Player Choice (3 options)",
  category: "prompts",
  description:
    "A PLAYER_CHOICE prompt over three labeled branches — the canonical \"choose one\" effect. Selecting any branch emits PLAYER_CHOICE { choiceId }; the predicate accepts all three.",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP01-060"],
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
        characters: [
          makeCard({ instanceId: "p1-char-1", cardId: "OP01-010", zone: "CHARACTER", controller: 1 }),
          null,
          null,
          null,
          null,
        ],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donDeck: makeDonStack({ count: 10, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    {
      type: "prompt",
      prompt: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose one effect to resolve",
        choices: [...CHOICES],
      },
    },
  ],
  expectedResponse: {
    allowedActionTypes: ["PLAYER_CHOICE"],
    predicate: (action) =>
      action.type === "PLAYER_CHOICE" && CHOICE_IDS.includes(action.choiceId),
    hint: "Pick one of the three options to continue",
  },
};
