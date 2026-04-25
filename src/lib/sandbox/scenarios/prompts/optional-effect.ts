// Interactive scenario: an OPTIONAL_EFFECT prompt — yes / no on a triggered
// effect. The modal emits two distinct action types depending on the choice:
// "Activate" sends PLAYER_CHOICE { choiceId: "activate" }, "Skip" sends PASS.
// The predicate accepts either path so both buttons advance the runner.

import type { TurnState } from "@shared/game-types";
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

const ME_CHARACTER = makeCard({
  instanceId: "p0-char-1",
  cardId: "OP01-010",
  zone: "CHARACTER",
  controller: 0,
  turnPlayed: 2,
});

export const optionalEffectScenario: Scenario = {
  id: "optional-effect",
  title: "Optional Effect (yes / no)",
  category: "prompts",
  description:
    "An OPTIONAL_EFFECT prompt — Activate or Skip on a triggered Character ability. Activate emits PLAYER_CHOICE { choiceId: \"activate\" }; Skip emits PASS. Both paths advance the runner.",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-010"],
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
        characters: [ME_CHARACTER, null, null, null, null],
        deck: Array.from({ length: 10 }, (_, i) =>
          makeCard({
            instanceId: `p0-deck-${i + 1}`,
            cardId: "OP01-010",
            zone: "DECK",
            controller: 0,
          }),
        ),
        life: makeLifeStack({ count: 4, cardId: "OP01-001", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 3, prefix: "p0-don" }),
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
    {
      type: "prompt",
      prompt: {
        promptType: "OPTIONAL_EFFECT",
        effectDescription:
          "[On Play] You may give 1 DON!! card to your Leader or 1 of your Characters.",
        cards: [ME_CHARACTER],
      },
    },
  ],
  expectedResponse: {
    // The modal emits one of two distinct action types — both must be allowed
    // through the input gate.
    allowedActionTypes: ["PLAYER_CHOICE", "PASS"],
    predicate: (action) =>
      (action.type === "PLAYER_CHOICE" && action.choiceId === "activate") ||
      action.type === "PASS",
    hint: "Activate the effect or skip — either choice continues",
  },
};
