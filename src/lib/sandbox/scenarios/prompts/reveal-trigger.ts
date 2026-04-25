// Interactive scenario: a Life card flips up, revealing an Event card with
// [Trigger] text. The REVEAL_TRIGGER prompt asks whether to activate the
// trigger (true) or just add the card to hand (false). Both choices satisfy
// the predicate. Uses OP01-030 — the only Event-with-trigger in the sandbox
// bundle (`SANDBOX_CARD_DB`).

import type { CardInstance, GameEvent, TurnState } from "@shared/game-types";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "../helpers";
import type { Scenario } from "../types";

const TURN: TurnState = {
  number: 2,
  activePlayerIndex: 1,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

const TRIGGER_CARD: CardInstance = makeCard({
  instanceId: "p0-life-1",
  cardId: "OP01-030",
  zone: "LIFE",
  controller: 0,
});

// Top-of-life is the trigger card; the rest are vanilla life entries.
const LIFE = [
  { instanceId: TRIGGER_CARD.instanceId, cardId: TRIGGER_CARD.cardId, face: "DOWN" as const },
  ...makeLifeStack({ count: 4, cardId: "OP01-001", prefix: "p0-life-rest" }),
];

const lifeFlip: GameEvent = {
  type: "CARD_ADDED_TO_HAND_FROM_LIFE",
  playerIndex: 0,
  payload: {
    cardId: TRIGGER_CARD.cardId,
    cardInstanceId: TRIGGER_CARD.instanceId,
  },
  timestamp: 1,
};

export const revealTriggerScenario: Scenario = {
  id: "reveal-trigger",
  title: "Reveal Trigger",
  category: "prompts",
  description:
    "A Life card flips up and reveals an Event with [Trigger] text. The REVEAL_TRIGGER prompt offers \"Reveal & Activate\" (true) or \"Add to Hand\" (false) — either choice advances the runner.",
  inputMode: "interactive",
  cardsUsed: ["OP01-001", "OP01-060", "OP01-030"],
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
        life: LIFE,
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
          makeCard({
            instanceId: "p1-char-attacker",
            cardId: "OP01-010",
            zone: "CHARACTER",
            controller: 1,
            state: "RESTED",
            turnPlayed: 1,
          }),
          null,
          null,
          null,
          null,
        ],
        life: makeLifeStack({ count: 5, cardId: "OP01-060", prefix: "p1-life" }),
        donCostArea: makeDonStack({ count: 1, prefix: "p1-don" }),
        donDeck: makeDonStack({ count: 9, prefix: "p1-don-deck" }),
      }),
    ],
  },
  script: [
    { type: "event", event: lifeFlip, delayMs: 100 },
    { type: "wait", ms: 80 },
    {
      type: "prompt",
      prompt: {
        promptType: "REVEAL_TRIGGER",
        cards: [TRIGGER_CARD],
        effectDescription:
          "[Trigger] Activate this card's [Main] effect: look at 5 cards from the top of your deck; reveal up to 1 {Straw Hat Crew} type Character card and add it to your hand.",
        optional: false,
        timeoutMs: 30_000,
      },
    },
  ],
  expectedResponse: {
    allowedActionTypes: ["REVEAL_TRIGGER"],
    predicate: (action) =>
      action.type === "REVEAL_TRIGGER" && typeof action.reveal === "boolean",
    hint: "Reveal & Activate the [Trigger] or add the card to hand",
  },
};
