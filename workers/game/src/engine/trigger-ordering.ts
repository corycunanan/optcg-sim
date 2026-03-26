/**
 * Simultaneous trigger ordering — helpers shared by pipeline.ts and resume.ts.
 *
 * Extracted to avoid circular imports (pipeline → effect-resolver → resume → pipeline).
 */

import type { CardData, GameState, PendingPromptState } from "../types.js";
import type { QueuedTrigger, EffectStackFrame } from "../types.js";
import type { EffectBlock } from "./effect-types.js";
import {
  matchTriggersForEvent,
  orderMatchedTriggers,
} from "./triggers.js";
import { pushFrame, generateFrameId } from "./effect-stack.js";
import { findCardInstance } from "./state.js";
import { extractEffectDescription } from "./effect-resolver/action-utils.js";

// ─── scanEventsForTriggers ──────────────────────────────────────────────────

/**
 * Scan a set of events for matching triggers, ordered per rule §8-6.
 * Used by both the main pipeline and resume paths to detect nested triggers.
 */
export function scanEventsForTriggers(
  state: GameState,
  events: { type: import("../types.js").GameEventType; playerIndex?: 0 | 1; payload?: Record<string, unknown> }[],
  defaultController: 0 | 1,
  cardDb: Map<string, CardData>,
): QueuedTrigger[] {
  const triggers: QueuedTrigger[] = [];

  for (const event of events) {
    const gameEvent = {
      type: event.type,
      playerIndex: event.playerIndex ?? defaultController,
      payload: event.payload ?? {},
      timestamp: Date.now(),
    };

    const matched = matchTriggersForEvent(state, gameEvent, cardDb);
    if (matched.length === 0) continue;

    const ordered = orderMatchedTriggers(matched, state.turn.activePlayerIndex);
    for (const match of ordered) {
      triggers.push({
        sourceCardInstanceId: match.trigger.sourceCardInstanceId,
        controller: match.trigger.controller,
        effectBlock: match.effectBlock,
        triggeringEvent: event,
      });
    }
  }

  return triggers;
}

// ─── buildTriggerSelectionPrompt ────────────────────────────────────────────

/**
 * Build a PLAYER_CHOICE prompt for simultaneous trigger ordering.
 * Pushes an EffectStackFrame with phase AWAITING_TRIGGER_ORDER_SELECTION.
 */
export function buildTriggerSelectionPrompt(
  state: GameState,
  triggers: QueuedTrigger[],
  afterTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
): { state: GameState; pendingPrompt: PendingPromptState } {
  const controller = triggers[0].controller;

  // Build choice labels from card name + effect description
  const choices = triggers.map((t, i) => {
    const card = findCardInstance(state, t.sourceCardInstanceId);
    const cardData = card ? cardDb.get(card.cardId) : null;
    const cardName = cardData?.name ?? "Unknown Card";
    const effectDesc = cardData
      ? extractEffectDescription(cardData.effectText, t.effectBlock as EffectBlock)
      : "Activate effect";
    return { id: String(i), label: `${cardName}: ${effectDesc}` };
  });

  // Add "Done" option if all remaining triggers are optional
  const allOptional = triggers.every(
    t => (t.effectBlock as EffectBlock).flags?.optional === true,
  );
  if (allOptional) {
    choices.push({ id: "done", label: "Done — skip remaining triggers" });
  }

  const frame: EffectStackFrame = {
    id: generateFrameId(),
    sourceCardInstanceId: triggers[0].sourceCardInstanceId,
    controller,
    effectBlock: triggers[0].effectBlock as EffectBlock,
    phase: "AWAITING_TRIGGER_ORDER_SELECTION",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: false,
    pendingTriggers: afterTriggers,
    simultaneousTriggers: triggers,
    accumulatedEvents: [],
  };

  const nextState = pushFrame(state, frame);

  const pendingPrompt: PendingPromptState = {
    promptType: "PLAYER_CHOICE",
    options: {
      effectDescription: "Choose which effect to activate first",
      choices,
    },
    respondingPlayer: controller,
    resumeContext: frame.id,
  };

  return { state: nextState, pendingPrompt };
}
