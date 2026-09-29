/**
 * OPT-779: effect prompts carry `actionLabel`, the player-facing action the
 * modal title names ("Card Effect: KO Characters").
 */
import { describe, expect, it } from "vitest";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import { actionTitle } from "../engine/effect-resolver/target-instruction.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import {
  resolvePromptActionLabel,
  withPromptSourceCard,
} from "../engine/prompt-source.js";
import { filterPromptForRecipient } from "../engine/visibility.js";
import type {
  EffectStackFrame,
  GameState,
  PendingPromptState,
} from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const emptyState = { effectStack: [] } as unknown as GameState;

function resumeContext(pausedAction: Action | null) {
  return {
    effectSourceInstanceId: "src",
    controller: 0 as const,
    pausedAction,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
  };
}

function selectTarget(pausedAction: Action | null): PendingPromptState {
  return {
    options: {
      promptType: "SELECT_TARGET",
      cards: [],
      validTargets: [],
      effectDescription: "[On Play] x",
      countMin: 1,
      countMax: 1,
      ctaLabel: "Confirm",
    },
    respondingPlayer: 0,
    resumeContext: resumeContext(pausedAction),
  };
}

const KO_ACTION: Action = {
  type: "KO",
  target: { type: "CHARACTER", controller: "OPPONENT" },
};

function stateWithFrame(frame: Partial<EffectStackFrame>): GameState {
  return { effectStack: [{ id: "f1", ...frame }] } as unknown as GameState;
}

describe("actionTitle", () => {
  it.each([
    ["KO", "KO Characters"],
    ["RETURN_TO_HAND", "Return to Hand"],
    ["RETURN_TO_DECK", "Return to Deck"],
    ["SET_REST", "Rest"],
    ["SET_ACTIVE", "Set Active"],
    ["TRASH_CARD", "Trash"],
    ["GIVE_DON", "Give DON!!"],
    ["PLAY_CARD", "Play Character"],
    ["SEARCH_DECK", "Search Deck"],
    ["SEARCH_AND_PLAY", "Search and Play"],
    ["DRAW", "Draw Cards"],
    ["ADD_TO_LIFE", "Add to Life"],
    ["GRANT_KEYWORD", "Grant Keyword"],
    ["REVEAL", "Reveal"],
    ["PLACE_HAND_TO_DECK", "Place on Deck"],
  ])("maps %s to %s", (type, label) => {
    expect(actionTitle({ type } as Action)).toBe(label);
  });

  it("splits MODIFY_POWER by sign", () => {
    expect(
      actionTitle({ type: "MODIFY_POWER", params: { amount: 2000 } } as Action)
    ).toBe("Increase Power");
    expect(
      actionTitle({ type: "MODIFY_POWER", params: { amount: -2000 } } as Action)
    ).toBe("Decrease Power");
  });

  it("splits MODIFY_COST by sign", () => {
    expect(
      actionTitle({ type: "MODIFY_COST", params: { amount: -2 } } as Action)
    ).toBe("Reduce Cost");
    expect(
      actionTitle({ type: "MODIFY_COST", params: { amount: 2 } } as Action)
    ).toBe("Increase Cost");
  });

  it.each([
    "APPLY_PROHIBITION",
    "SCHEDULE_ACTION",
    "REUSE_EFFECT",
    "NEGATE_EFFECTS",
    "WIN_GAME",
    "EXTRA_TURN",
  ])("never surfaces internal type %s", (type) => {
    expect(actionTitle({ type } as Action)).toBeUndefined();
    expect(actionTitle(null)).toBeUndefined();
  });

  it("unwraps OPPONENT_ACTION to the inner action", () => {
    expect(
      actionTitle({ type: "OPPONENT_ACTION", params: { action: KO_ACTION } } as Action)
    ).toBe("KO Characters");
    expect(
      actionTitle({
        type: "OPPONENT_ACTION",
        params: { action: { type: "APPLY_PROHIBITION" } },
      } as Action)
    ).toBeUndefined();
  });
});

describe("resolvePromptActionLabel", () => {
  it("uses the paused action for SELECT_TARGET", () => {
    expect(resolvePromptActionLabel(emptyState, selectTarget(KO_ACTION))).toBe(
      "KO Characters"
    );
  });

  it("uses the paused action for ARRANGE_TOP_CARDS", () => {
    const prompt: PendingPromptState = {
      options: {
        promptType: "ARRANGE_TOP_CARDS",
        cards: [],
        effectDescription: "x",
        canSendToBottom: true,
      },
      respondingPlayer: 0,
      resumeContext: resumeContext({ type: "SEARCH_DECK" } as Action),
    };
    expect(resolvePromptActionLabel(emptyState, prompt)).toBe("Search Deck");
  });

  it("falls back (undefined) for an internal paused action or none", () => {
    expect(
      resolvePromptActionLabel(
        emptyState,
        selectTarget({ type: "APPLY_PROHIBITION" } as Action)
      )
    ).toBeUndefined();
    expect(
      resolvePromptActionLabel(emptyState, selectTarget(null))
    ).toBeUndefined();
  });

  it("reads the paused action from the effect frame for string contexts", () => {
    const prompt = { ...selectTarget(null), resumeContext: "f1" };
    const state = stateWithFrame({
      pausedAction: KO_ACTION,
      costs: [],
      costsPaid: true,
    });
    expect(resolvePromptActionLabel(state, prompt)).toBe("KO Characters");
    expect(resolvePromptActionLabel(emptyState, prompt)).toBeUndefined();
  });

  it("labels cost-selection prompts Pay Cost", () => {
    const prompt = { ...selectTarget(null), resumeContext: "f1" };
    const state = stateWithFrame({
      pausedAction: KO_ACTION,
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 } as never],
      costsPaid: false,
    });
    expect(resolvePromptActionLabel(state, prompt)).toBe("Pay Cost");
  });

  it("labels OPTIONAL_EFFECT by the first player-facing action in the block", () => {
    const prompt: PendingPromptState = {
      options: { promptType: "OPTIONAL_EFFECT", effectDescription: "x" },
      respondingPlayer: 0,
      resumeContext: "f1",
    };
    const state = stateWithFrame({
      pausedAction: null,
      // costs unpaid on an optional block must not read as Pay Cost
      costs: [{ type: "TRASH_FROM_HAND", amount: 1 } as never],
      costsPaid: false,
      effectBlock: {
        actions: [
          { type: "APPLY_PROHIBITION" },
          { type: "DRAW", params: { amount: 1 } },
          KO_ACTION,
        ],
      } as EffectBlock,
    });
    expect(resolvePromptActionLabel(state, prompt)).toBe("Draw Cards");
  });

  it("labels an optional action prompt by its paused action", () => {
    const prompt: PendingPromptState = {
      options: { promptType: "OPTIONAL_EFFECT", effectDescription: "x" },
      respondingPlayer: 0,
      resumeContext: "f1",
    };
    const state = stateWithFrame({
      pausedAction: KO_ACTION,
      costs: [],
      costsPaid: true,
      effectBlock: { actions: [] } as unknown as EffectBlock,
    });
    expect(resolvePromptActionLabel(state, prompt)).toBe("KO Characters");
  });

  it("gives replacement OPTIONAL_EFFECT prompts no label", () => {
    const prompt: PendingPromptState = {
      options: { promptType: "OPTIONAL_EFFECT", effectDescription: "x" },
      respondingPlayer: 0,
      resumeContext: {
        type: "REPLACEMENT",
        effectId: "e",
        targetInstanceId: "t",
      } as never,
    };
    expect(resolvePromptActionLabel(emptyState, prompt)).toBeUndefined();
  });

  it("labels REVEAL_TRIGGER Trigger", () => {
    const prompt: PendingPromptState = {
      options: {
        promptType: "REVEAL_TRIGGER",
        cards: [],
        effectDescription: "x",
        optional: true,
        timeoutMs: 1,
      },
      respondingPlayer: 0,
      resumeContext: null,
    };
    expect(resolvePromptActionLabel(emptyState, prompt)).toBe("Trigger");
  });

  it("labels PLAYER_CHOICE branch prompts Choose an Effect", () => {
    const prompt: PendingPromptState = {
      options: {
        promptType: "PLAYER_CHOICE",
        choices: [{ id: "0", label: "A" }],
        effectDescription: "x",
      },
      respondingPlayer: 0,
      resumeContext: resumeContext({ type: "PLAYER_CHOICE" } as Action),
    };
    expect(resolvePromptActionLabel(emptyState, prompt)).toBe("Choose an Effect");
    // A choice raised by another action is named for that action.
    expect(
      resolvePromptActionLabel(emptyState, {
        ...prompt,
        resumeContext: resumeContext({ type: "PLAY_CARD" } as Action),
      })
    ).toBe("Play Character");
  });

  it("gives blocker and pregame prompts no label", () => {
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
        choices: [{ id: "FIRST", label: "First" }],
        effectDescription: "PREGAME_FIRST_OR_SECOND",
        source: "PREGAME",
      },
      respondingPlayer: 0,
      resumeContext: { type: "PREGAME_PRIORITY_CHOICE" },
    };
    expect(resolvePromptActionLabel(emptyState, blocker)).toBeUndefined();
    expect(resolvePromptActionLabel(emptyState, pregame)).toBeUndefined();
    expect(withPromptSourceCard(emptyState, pregame)).toBe(pregame);
  });

  it("uses the inner label for an OPPONENT_ACTION paused action", () => {
    expect(
      resolvePromptActionLabel(
        emptyState,
        selectTarget({
          type: "OPPONENT_ACTION",
          params: { action: KO_ACTION },
        } as Action)
      )
    ).toBe("KO Characters");
  });
});

describe("actionLabel through the real resolver and send path", () => {
  const block = (actions: Action[], extra: Partial<EffectBlock> = {}) =>
    ({
      id: "b",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions,
      ...extra,
    }) as EffectBlock;

  it("attaches KO Characters to a resolver-built SELECT_TARGET prompt", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const result = resolveEffect(
      state,
      block([
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        },
      ]),
      "char-0-v1",
      0,
      cardDb
    );
    const sent = withPromptSourceCard(result.state, result.pendingPrompt!);
    expect(sent.options).toMatchObject({
      promptType: "SELECT_TARGET",
      actionLabel: "KO Characters",
    });
  });

  it("labels a resolver-built cost-selection prompt Pay Cost", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const result = resolveEffect(
      state,
      block([{ type: "DRAW", params: { amount: 1 } }], {
        costs: [{ type: "TRASH_FROM_HAND", amount: 1 }],
      } as Partial<EffectBlock>),
      "char-0-v1",
      0,
      cardDb
    );
    expect(result.pendingPrompt).toBeDefined();
    const sent = withPromptSourceCard(result.state, result.pendingPrompt!);
    expect(sent.options).toMatchObject({ actionLabel: "Pay Cost" });
  });

  it("labels a resolver-built optional block by its first action", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const result = resolveEffect(
      state,
      block([{ type: "DRAW", params: { amount: 1 } }], { flags: { optional: true } }),
      "char-0-v1",
      0,
      cardDb
    );
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const sent = withPromptSourceCard(result.state, result.pendingPrompt!);
    expect(sent.options).toMatchObject({ actionLabel: "Draw Cards" });
  });

  it("carries the label to observers unchanged (action type, not card identity)", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const result = resolveEffect(
      state,
      block([
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
        },
      ]),
      "char-0-v1",
      0,
      cardDb
    );
    const sent = withPromptSourceCard(result.state, result.pendingPrompt!);
    const observed = filterPromptForRecipient(sent, { kind: "OBSERVER" } as never);
    expect(observed?.options).toMatchObject({ actionLabel: "KO Characters" });
  });
});
