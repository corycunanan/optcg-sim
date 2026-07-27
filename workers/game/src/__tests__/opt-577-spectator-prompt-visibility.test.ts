import { describe, expect, it } from "vitest";
import type {
  CardInstance,
  GameState,
  PendingPromptState,
  PromptOptions,
} from "../types.js";
import { emitPendingEvent } from "../engine/events.js";
import type { ActionOf } from "../engine/effect-types.js";
import { executeLifeScry } from "../engine/effect-resolver/actions/life.js";
import { filterPromptForRecipient } from "../engine/visibility.js";
import {
  visibleStateForPlayer,
  visibleStateForSpectator,
} from "../session/visibility.js";
import { advanceToPhase, setupGame } from "./factories.js";

const promptCard: CardInstance = {
  instanceId: "private-prompt-instance",
  cardId: "PRIVATE-PROMPT-CARD",
  zone: "LIFE",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 1,
  owner: 1,
};

const redactedPromptCard: CardInstance = {
  ...promptCard,
  instanceId: "hidden",
  cardId: "hidden",
  attachedDon: [],
};

const faceBearingPrompts: Array<{
  promptType: string;
  effectDescription: string;
  options: PromptOptions;
  expectedOptions: PromptOptions;
}> = [
  {
    promptType: "REVEAL_TRIGGER",
    effectDescription: "Reveal the Trigger?",
    options: {
      promptType: "REVEAL_TRIGGER",
      cards: [promptCard],
      effectDescription: "Reveal the Trigger?",
      optional: true,
      timeoutMs: 30_000,
    },
    expectedOptions: {
      promptType: "REVEAL_TRIGGER",
      cards: [redactedPromptCard],
      effectDescription: "Reveal the Trigger?",
      optional: true,
      timeoutMs: 30_000,
    },
  },
  {
    promptType: "ARRANGE_TOP_CARDS",
    effectDescription: "Place the card at the top or bottom.",
    options: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: [promptCard],
      effectDescription: "Place the card at the top or bottom.",
      canSendToBottom: true,
      validTargets: [promptCard.instanceId],
    },
    expectedOptions: {
      promptType: "ARRANGE_TOP_CARDS",
      cards: [redactedPromptCard],
      effectDescription: "Place the card at the top or bottom.",
      canSendToBottom: true,
      validTargets: [],
    },
  },
  {
    promptType: "SELECT_TARGET",
    effectDescription: "Choose a target.",
    options: {
      promptType: "SELECT_TARGET",
      cards: [promptCard],
      validTargets: [promptCard.instanceId],
      effectDescription: "Choose a target.",
      countMin: 1,
      countMax: 1,
      ctaLabel: "Choose",
      dualTargets: {
        slots: [{
          validIds: [promptCard.instanceId],
          countMin: 1,
          countMax: 1,
        }],
      },
    },
    expectedOptions: {
      promptType: "SELECT_TARGET",
      cards: [redactedPromptCard],
      validTargets: [],
      effectDescription: "Choose a target.",
      countMin: 1,
      countMax: 1,
      ctaLabel: "Choose",
      dualTargets: {
        slots: [{ validIds: [], countMin: 1, countMax: 1 }],
      },
    },
  },
  {
    promptType: "OPTIONAL_EFFECT",
    effectDescription: "Use this effect?",
    options: {
      promptType: "OPTIONAL_EFFECT",
      effectDescription: "Use this effect?",
      cards: [promptCard],
    },
    expectedOptions: {
      promptType: "OPTIONAL_EFFECT",
      effectDescription: "Use this effect?",
      cards: [redactedPromptCard],
    },
  },
];

function collectStringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringLeaves);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(collectStringLeaves);
  }
  return [];
}

function withPrompt(state: GameState, options: PromptOptions): GameState {
  return {
    ...state,
    pendingPrompt: {
      promptId: `prompt-${options.promptType}`,
      options,
      respondingPlayer: 0,
      resumeContext: `private-resume-${promptCard.cardId}`,
    },
  };
}

describe("OPT-577 spectator prompt visibility", () => {
  it.each(faceBearingPrompts)(
    "redacts $promptType card faces through visibleStateForSpectator",
    ({ effectDescription, expectedOptions, options }) => {
      const { state, cardDb } = setupGame();
      const spectator = visibleStateForSpectator(
        withPrompt(state, options),
        cardDb
      );
      expect(spectator.pendingPrompt).toEqual({
        promptId: `prompt-${options.promptType}`,
        options: expectedOptions,
        respondingPlayer: 0,
        resumeContext: null,
      });
      expect(collectStringLeaves(spectator)).not.toContain(promptCard.cardId);
      expect(collectStringLeaves(spectator)).not.toContain(promptCard.instanceId);
      expect(collectStringLeaves(spectator)).not.toContain(
        `private-resume-${promptCard.cardId}`
      );
      expect(collectStringLeaves(spectator)).toContain(effectDescription);
    }
  );

  it.each([
    {
      promptType: "SELECT_BLOCKER",
      options: {
        promptType: "SELECT_BLOCKER",
        validTargets: ["public-blocker"],
        optional: true,
        timeoutMs: 30_000,
      } satisfies PromptOptions,
    },
    {
      promptType: "REDISTRIBUTE_DON",
      options: {
        promptType: "REDISTRIBUTE_DON",
        validSourceCardIds: ["public-source"],
        validTargetCardIds: ["public-target"],
        maxTransfers: 1,
        effectDescription: "Move DON!!",
      } satisfies PromptOptions,
    },
    {
      promptType: "PLAYER_CHOICE",
      options: {
        promptType: "PLAYER_CHOICE",
        choices: [{ id: "yes", label: "Yes" }],
        effectDescription: "Choose an option.",
      } satisfies PromptOptions,
    },
  ])("preserves $promptType passive metadata for spectators", ({ options }) => {
    const { state, cardDb } = setupGame();
    const spectator = visibleStateForSpectator(
      withPrompt(state, options),
      cardDb
    );

    expect(spectator.pendingPrompt?.options).toEqual(options);
  });

  it("keeps opponent Life-scry identities for the responding player only", () => {
    const { state, cardDb } = setupGame();
    const main = advanceToPhase(state, "MAIN", cardDb);
    const players = [...main.players] as GameState["players"];
    players[1] = {
      ...players[1],
      life: [
        { ...players[1].life[0]!, cardId: "LIVE-LIFE-SCRY-SECRET" },
        ...players[1].life.slice(1),
      ],
    };
    const lifeScryState = { ...main, players };
    const opponentLife = lifeScryState.players[1].life[0]!;
    const result = executeLifeScry(
      lifeScryState,
      {
        type: "LIFE_SCRY",
        target: {
          type: "LIFE_CARD",
          controller: "EITHER",
        },
        params: { look_at: 1 },
      } as ActionOf<"LIFE_SCRY">,
      main.players[0].leader.instanceId,
      0,
      cardDb,
      new Map(),
      [opponentLife.instanceId]
    );
    if (!result.pendingPrompt)
      throw new Error("Life scry must pause for placement");
    const lifeScryOptions = result.pendingPrompt.options;
    if (lifeScryOptions.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Life scry must produce an arrange prompt");
    }
    const lifeScryPrompt = result.pendingPrompt;

    const prompted = result.events.reduce<GameState>(
      (current, event) => emitPendingEvent(current, event, 0),
      { ...result.state, pendingPrompt: lifeScryPrompt } as GameState
    );
    const responder = visibleStateForPlayer(prompted, cardDb, 0);
    const spectator = visibleStateForSpectator(prompted, cardDb);

    expect(JSON.stringify(responder.pendingPrompt)).toContain(
      opponentLife.cardId
    );
    expect(JSON.stringify(responder.eventLog)).toContain(opponentLife.cardId);
    const spectatorStrings = collectStringLeaves(spectator);
    expect(spectatorStrings).not.toContain(opponentLife.cardId);
    expect(spectatorStrings).not.toContain(opponentLife.instanceId);
    expect(spectator.pendingPrompt).toEqual({
      ...lifeScryPrompt,
      options: {
        ...lifeScryOptions,
        cards: [{
          ...lifeScryOptions.cards[0],
          cardId: "hidden",
          instanceId: "hidden",
          attachedDon: [],
        }],
        validTargets: [],
      },
      resumeContext: null,
    });
  });

  it("fails closed for an unknown future prompt type", () => {
    const unknownPrompt = {
      options: {
        promptType: "FUTURE_SECRET_PROMPT",
        cards: [promptCard],
      },
      respondingPlayer: 0,
      resumeContext: `private-resume-${promptCard.cardId}`,
    } as unknown as PendingPromptState;
    const { state, cardDb } = setupGame();

    expect(
      filterPromptForRecipient(unknownPrompt, { kind: "OBSERVER" })
    ).toBeNull();
    const spectator = visibleStateForSpectator(
      { ...state, pendingPrompt: unknownPrompt },
      cardDb
    );
    expect(spectator.pendingPrompt).toBeNull();
    const spectatorStrings = collectStringLeaves(spectator);
    expect(spectatorStrings).not.toContain(promptCard.cardId);
    expect(spectatorStrings).not.toContain(promptCard.instanceId);
  });
});
