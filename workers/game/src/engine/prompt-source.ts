/**
 * Prompt source attribution.
 *
 * Every effect modal on the client is framed the same way: the effect timing in
 * the title, the source card's name above the effect text, then the choice.
 * Prompt builders across the resolver do not carry the source card on the
 * wire, so the session attaches it here, once, right before a prompt is sent.
 *
 * OPT-779: the title names the action being chosen for (`Card Effect: KO
 * Characters`), so the same step derives `actionLabel` from the paused action.
 */

import type { PromptSourceCard } from "../../../../shared/game-types.js";
import type {
  EffectStackFrame,
  GameState,
  PendingPromptState,
} from "../types.js";
import type { Action } from "./effect-types.js";
import { actionTitle } from "./effect-resolver/target-instruction.js";
import { findCardInstance } from "./state.js";

function sourceInstanceIdFromResumeContext(
  resumeContext: unknown
): string | undefined {
  if (!resumeContext || typeof resumeContext !== "object") return undefined;
  const candidate = (resumeContext as { effectSourceInstanceId?: unknown })
    .effectSourceInstanceId;
  return typeof candidate === "string" && candidate ? candidate : undefined;
}

/**
 * Resolve the card whose effect raised `prompt`, or `undefined` when the prompt
 * has no effect source (blocker selection, pregame decisions).
 */
export function resolvePromptSourceCard(
  state: GameState,
  prompt: PendingPromptState
): PromptSourceCard | undefined {
  const options = prompt.options;
  if (options.promptType === "SELECT_BLOCKER") return undefined;
  if (options.promptType === "PLAYER_CHOICE" && options.source === "PREGAME") {
    return undefined;
  }
  if (
    (options.promptType === "OPTIONAL_EFFECT" ||
      options.promptType === "REVEAL_TRIGGER") &&
    options.cards?.[0]
  ) {
    const card = options.cards[0];
    return { cardId: card.cardId, instanceId: card.instanceId };
  }

  const instanceId =
    sourceInstanceIdFromResumeContext(prompt.resumeContext) ??
    state.effectStack[state.effectStack.length - 1]?.sourceCardInstanceId;
  if (!instanceId) return undefined;
  const card = findCardInstance(state, instanceId);
  return card
    ? { cardId: card.cardId, instanceId: card.instanceId }
    : undefined;
}

function pausedActionFromResumeContext(
  resumeContext: unknown
): Action | null | undefined {
  if (!resumeContext || typeof resumeContext !== "object") return undefined;
  if (!("pausedAction" in resumeContext)) return undefined;
  return (resumeContext as { pausedAction: Action | null }).pausedAction;
}

function isChoiceAction(action: Action | null | undefined): boolean {
  return action?.type === "PLAYER_CHOICE" || action?.type === "OPPONENT_CHOICE";
}

/** True while the frame is still collecting activation costs. */
function isPayingCosts(frame: EffectStackFrame): boolean {
  return (frame.costs?.length ?? 0) > 0 && !frame.costsPaid;
}

/** First action in the block that has a player-facing label. */
function firstPlayerFacingLabel(
  actions: readonly Action[] | undefined
): string | undefined {
  for (const action of actions ?? []) {
    const label = actionTitle(action);
    if (label) return label;
  }
  return undefined;
}

/**
 * Player-facing name of the action a prompt is asking about, or `undefined`
 * when there is none (pregame, blocker selection, internal action types), so
 * the client falls back to its timing-based title. Derived from action types
 * only, never from card identities.
 */
export function resolvePromptActionLabel(
  state: GameState,
  prompt: PendingPromptState
): string | undefined {
  const options = prompt.options;
  if (options.promptType === "SELECT_BLOCKER") return undefined;
  if (options.promptType === "REVEAL_TRIGGER") return "Trigger";
  if (options.promptType === "PLAYER_CHOICE" && options.source === "PREGAME") {
    return undefined;
  }

  const context = prompt.resumeContext;
  const frame =
    typeof context === "string"
      ? state.effectStack.find((candidate) => candidate.id === context)
      : undefined;
  if (typeof context === "string" && !frame) return undefined;
  if (frame && isPayingCosts(frame) && options.promptType !== "OPTIONAL_EFFECT") {
    return "Pay Cost";
  }

  const pausedAction = frame
    ? frame.pausedAction
    : pausedActionFromResumeContext(context);

  if (options.promptType === "OPTIONAL_EFFECT") {
    // Replacement prompts carry a typed context and no effect-chain frame.
    if (!frame && pausedAction === undefined) return undefined;
    return (
      actionTitle(pausedAction) ??
      firstPlayerFacingLabel(frame?.effectBlock.actions)
    );
  }

  if (options.promptType === "PLAYER_CHOICE") {
    // A branch prompt (or trigger-ordering prompt, which has no paused action)
    // is a choice between effects; a choice raised by a real action (Life
    // destination, DON!! return, play state) is named for that action.
    if (!pausedAction || isChoiceAction(pausedAction)) {
      return frame || pausedAction ? "Choose an Effect" : undefined;
    }
  }

  return actionTitle(pausedAction);
}

/**
 * Return `prompt` with its source card and action label attached when they can
 * be resolved.
 */
export function withPromptSourceCard(
  state: GameState,
  prompt: PendingPromptState
): PendingPromptState {
  if (prompt.options.promptType === "SELECT_BLOCKER") return prompt;
  const sourceCard = prompt.options.sourceCard
    ? undefined
    : resolvePromptSourceCard(state, prompt);
  const actionLabel = prompt.options.actionLabel
    ? undefined
    : resolvePromptActionLabel(state, prompt);
  if (!sourceCard && !actionLabel) return prompt;
  return {
    ...prompt,
    options: {
      ...prompt.options,
      ...(sourceCard ? { sourceCard } : {}),
      ...(actionLabel ? { actionLabel } : {}),
    },
  };
}
