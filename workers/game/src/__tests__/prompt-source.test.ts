/**
 * Prompt source attribution: the session attaches the card whose effect raised
 * a prompt so the client can name it in the modal frame.
 */
import { describe, expect, it } from "vitest";
import {
  resolvePromptSourceCard,
  withPromptSourceCard,
} from "../engine/prompt-source.js";
import type {
  CardInstance,
  GameState,
  PendingPromptState,
  PlayerState,
} from "../types.js";

function makeCard(instanceId: string, cardId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
}

function emptyPlayer(playerId: string, leader: CardInstance): PlayerState {
  return {
    playerId,
    leader,
    characters: [null, null, null, null, null],
    stage: null,
    hand: [],
    deck: [],
    life: [],
    donDeck: [],
    donCostArea: [],
    trash: [],
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: null,
    donArtUrl: null,
  };
}

function stateWithCharacter(card: CardInstance): GameState {
  const p0 = emptyPlayer("p0", {
    ...makeCard("L0", "L0-DATA"),
    zone: "LEADER",
  });
  p0.characters = [card, null, null, null, null];
  const p1 = emptyPlayer("p1", {
    ...makeCard("L1", "L1-DATA"),
    zone: "LEADER",
    controller: 1,
    owner: 1,
  });
  return {
    id: "g",
    players: [p0, p1],
    turn: {
      number: 1,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
      deckHitZeroThisTurn: [false, false],
    },
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pregame: null,
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
  } as unknown as GameState;
}

const source = makeCard("src-1", "OP01-001");

describe("resolvePromptSourceCard", () => {
  it("reads the effect source from the resume context", () => {
    const prompt: PendingPromptState = {
      options: {
        promptType: "SELECT_TARGET",
        cards: [],
        validTargets: [],
        effectDescription: "[On Play] Choose a Character",
        countMin: 1,
        countMax: 1,
        ctaLabel: "Confirm",
      },
      respondingPlayer: 0,
      resumeContext: {
        effectSourceInstanceId: "src-1",
        controller: 0,
        pausedAction: null,
        remainingActions: [],
        resultRefs: [],
        validTargets: [],
      },
    };
    expect(resolvePromptSourceCard(stateWithCharacter(source), prompt)).toEqual(
      { cardId: "OP01-001", instanceId: "src-1" }
    );
  });

  it("falls back to the top effect-stack frame", () => {
    const state = stateWithCharacter(source);
    const prompt: PendingPromptState = {
      options: {
        promptType: "PLAYER_CHOICE",
        choices: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        effectDescription: "Choose which effect to activate first",
      },
      respondingPlayer: 0,
      resumeContext: "frame-1",
    };
    const stacked: GameState = {
      ...state,
      effectStack: [
        {
          id: "frame-1",
          sourceCardInstanceId: "src-1",
          controller: 0,
          effectBlock: {} as never,
          phase: "RESOLVING" as never,
          pausedAction: null,
          remainingActions: [],
          resultRefs: [],
          validTargets: [],
        } as never,
      ],
    };
    expect(resolvePromptSourceCard(stacked, prompt)).toEqual({
      cardId: "OP01-001",
      instanceId: "src-1",
    });
  });

  it("uses the prompt's own card for optional-effect and trigger prompts", () => {
    const state = stateWithCharacter(source);
    const prompt: PendingPromptState = {
      options: {
        promptType: "OPTIONAL_EFFECT",
        effectDescription: "[On Play] You may draw 1 card.",
        cards: [makeCard("opt-1", "OP01-002")],
      },
      respondingPlayer: 0,
      resumeContext: null,
    };
    expect(resolvePromptSourceCard(state, prompt)).toEqual({
      cardId: "OP01-002",
      instanceId: "opt-1",
    });
  });

  it("leaves blocker and pregame prompts without a source", () => {
    const state = stateWithCharacter(source);
    const blocker: PendingPromptState = {
      options: {
        promptType: "SELECT_BLOCKER",
        validTargets: [],
        optional: true,
        timeoutMs: 1,
      },
      respondingPlayer: 0,
      resumeContext: null,
    };
    const pregame: PendingPromptState = {
      options: {
        promptType: "PLAYER_CHOICE",
        choices: [
          { id: "FIRST", label: "Go first" },
          { id: "SECOND", label: "Go second" },
        ],
        effectDescription: "PREGAME_FIRST_OR_SECOND",
        source: "PREGAME",
      },
      respondingPlayer: 0,
      resumeContext: { type: "PREGAME_PRIORITY_CHOICE" },
    };
    expect(resolvePromptSourceCard(state, blocker)).toBeUndefined();
    expect(resolvePromptSourceCard(state, pregame)).toBeUndefined();
    expect(withPromptSourceCard(state, blocker)).toBe(blocker);
    expect(withPromptSourceCard(state, pregame)).toBe(pregame);
  });

  it("attaches the source onto the sent prompt without touching the original", () => {
    const state = stateWithCharacter(source);
    const prompt: PendingPromptState = {
      options: {
        promptType: "ARRANGE_TOP_CARDS",
        cards: [],
        effectDescription:
          "[On Play] Look at 5 cards from the top of your deck",
        canSendToBottom: true,
      },
      respondingPlayer: 0,
      resumeContext: {
        effectSourceInstanceId: "src-1",
        controller: 0,
        pausedAction: null,
        remainingActions: [],
        resultRefs: [],
        validTargets: [],
      },
    };
    const sent = withPromptSourceCard(state, prompt);
    expect(
      sent.options.promptType === "ARRANGE_TOP_CARDS" && sent.options.sourceCard
    ).toEqual({
      cardId: "OP01-001",
      instanceId: "src-1",
    });
    expect(prompt.options).not.toHaveProperty("sourceCard");
  });
});
