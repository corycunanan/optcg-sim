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

const faceBearingPrompts: Array<{
  promptType: string;
  effectDescription: string;
  options: PromptOptions;
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
  },
];

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
    ({ effectDescription, options }) => {
      const { state, cardDb } = setupGame();
      const spectator = visibleStateForSpectator(
        withPrompt(state, options),
        cardDb
      );
      const serialized = JSON.stringify(spectator);

      expect(spectator.pendingPrompt?.options.promptType).toBe(
        options.promptType
      );
      expect(spectator.pendingPrompt?.resumeContext).toBeNull();
      expect(serialized).not.toContain(promptCard.cardId);
      expect(serialized).not.toContain("private-resume");
      expect(serialized).toContain(effectDescription);
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

    const prompted = result.events.reduce<GameState>(
      (current, event) => emitPendingEvent(current, event, 0),
      { ...result.state, pendingPrompt: result.pendingPrompt } as GameState
    );
    const responder = visibleStateForPlayer(prompted, cardDb, 0);
    const spectator = visibleStateForSpectator(prompted, cardDb);

    expect(JSON.stringify(responder.pendingPrompt)).toContain(
      opponentLife.cardId
    );
    expect(JSON.stringify(responder.eventLog)).toContain(opponentLife.cardId);
    expect(JSON.stringify(spectator)).not.toContain(opponentLife.cardId);
    expect(spectator.pendingPrompt?.options.promptType).toBe(
      "ARRANGE_TOP_CARDS"
    );
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
    expect(JSON.stringify(spectator)).not.toContain(promptCard.cardId);
  });
});
