/**
 * Prompt source attribution.
 *
 * Every effect modal on the client is framed the same way: the effect timing in
 * the title, the source card's name above the effect text, then the choice.
 * Prompt builders across the resolver do not carry the source card on the
 * wire, so the session attaches it here, once, right before a prompt is sent.
 */

import type { PromptSourceCard } from "../../../../shared/game-types.js";
import type { GameState, PendingPromptState } from "../types.js";
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

/** Return `prompt` with its source card attached when one can be resolved. */
export function withPromptSourceCard(
  state: GameState,
  prompt: PendingPromptState
): PendingPromptState {
  if (prompt.options.promptType === "SELECT_BLOCKER") return prompt;
  if (prompt.options.sourceCard) return prompt;
  const sourceCard = resolvePromptSourceCard(state, prompt);
  if (!sourceCard) return prompt;
  return { ...prompt, options: { ...prompt.options, sourceCard } };
}
