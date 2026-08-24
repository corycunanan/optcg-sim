/**
 * Simultaneous trigger ordering — helpers shared by pipeline.ts and resume.ts.
 *
 * Extracted to avoid circular imports (pipeline → effect-resolver → resume → pipeline).
 */

import type {
  CardData,
  GameState,
  PendingPromptState,
  PendingEvent,
} from "../types.js";
import type { QueuedTrigger, EffectStackFrame } from "../types.js";
import {
  matchTriggersForEvent,
  orderMatchedTriggers,
  registerTriggersForCard,
  registerReplacementsForCard,
} from "./triggers.js";
import { pushFrame, generateFrameId } from "./effect-stack.js";
import { isEngineTerminated } from "./engine-limits.js";
import { findCardInstance } from "./state.js";
import { extractEffectDescription } from "./effect-resolver/action-utils.js";
import { withTriggerScanned } from "./events.js";
import { takeEngineTimestamp } from "./execution-context.js";

// ─── scanEventsForTriggers ──────────────────────────────────────────────────

/**
 * Scan a set of events for matching triggers, ordered per rule §8-6.
 * Used by both the main pipeline and resume paths to detect nested triggers.
 */
export function scanEventsForTriggers(
  state: GameState,
  events: PendingEvent[],
  defaultController: 0 | 1,
  cardDb: Map<string, CardData>,
  groupSourceInstanceId?: string
): { triggers: QueuedTrigger[]; state: GameState; events: PendingEvent[] } {
  const triggers: QueuedTrigger[] = [];
  let nextState = state;
  const scannedEvents = events.map(withTriggerScanned);

  // Register triggers for newly played cards before matching
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.type === "CARD_PLAYED") {
      const { cardId, cardInstanceId } = event.payload ?? {};
      if (!cardId || !cardInstanceId) continue;

      const cardData = cardDb.get(cardId);
      if (!cardData) continue;

      const instance = findCardInstance(nextState, cardInstanceId);
      if (instance) {
        nextState = registerTriggersForCard(nextState, instance, cardData);
        nextState = registerReplacementsForCard(nextState, instance, cardData);
      }
    }
  }

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    // OPT-173: skip events that an inner multi-target batch handler already
    // scanned via its `pendingBatchTriggers` drain. Without this guard, the
    // pipeline's outer LIFO scan re-matches the same events and queues the
    // same triggers a second time.
    if (event.propagation?.triggerScanned) continue;

    const timed = takeEngineTimestamp(nextState);
    nextState = timed.state;
    const gameEvent = {
      type: event.type,
      playerIndex: event.playerIndex ?? defaultController,
      payload: event.payload ?? {},
      timestamp: timed.timestamp,
    } as import("../types.js").GameEvent;

    const matched = matchTriggersForEvent(nextState, gameEvent, cardDb);
    if (matched.length === 0) continue;

    const ordered = orderMatchedTriggers(
      matched,
      nextState.turn.activePlayerIndex
    );
    for (const match of ordered) {
      triggers.push({
        sourceCardInstanceId: match.trigger.sourceCardInstanceId,
        ...(groupSourceInstanceId ? { groupSourceInstanceId } : {}),
        controller: match.trigger.controller,
        effectBlock: match.effectBlock,
        triggeringEvent: scannedEvents[index],
      });
    }
  }

  return { triggers, state: nextState, events: scannedEvents };
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
  triggerOrderingGroup?: EffectStackFrame["triggerOrderingGroup"]
): { state: GameState; pendingPrompt?: PendingPromptState } {
  const fullTriggers = withStableOrderingIds(
    triggerOrderingGroup?.triggers ?? triggers
  );
  const orderingGroup = {
    triggers: fullTriggers,
    resolvedTriggerIds: triggerOrderingGroup?.resolvedTriggerIds ?? [],
  };
  const triggersById = new Map(
    fullTriggers.map((trigger) => [trigger.orderingId, trigger])
  );
  const remainingTriggers = triggerOrderingGroup
    ? triggers.map(
        (trigger) => triggersById.get(trigger.orderingId) ?? trigger
      )
    : fullTriggers;
  const controller = remainingTriggers[0].controller;
  const resolvedIds = new Set(orderingGroup.resolvedTriggerIds);

  // Build choice labels from card name + effect description
  const choices = orderingGroup.triggers.map((t) => {
    const card = findCardInstance(state, t.sourceCardInstanceId);
    const cardData = card ? cardDb.get(card.cardId) : null;
    const cardName = cardData?.name ?? "Unknown Card";
    const effectDesc = cardData
      ? extractEffectDescription(cardData.effectText, t.effectBlock)
      : "Activate effect";
    return {
      id: t.orderingId!,
      label: `${cardName}: ${effectDesc}`,
      ...(resolvedIds.has(t.orderingId!) ? { disabled: true } : {}),
    };
  });

  // Add "Done" option if all remaining triggers are optional
  const allOptional = remainingTriggers.every(
    (t) => t.effectBlock.flags?.optional === true
  );
  if (allOptional) {
    choices.push({ id: "done", label: "Done — skip remaining triggers" });
  }

  const frameId = generateFrameId(state);
  const frame: EffectStackFrame = {
    id: frameId.id,
    sourceCardInstanceId: remainingTriggers[0].sourceCardInstanceId,
    controller,
    effectBlock: remainingTriggers[0].effectBlock,
    phase: "AWAITING_TRIGGER_ORDER_SELECTION",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: false,
    costResultRefs: [],
    pendingTriggers: afterTriggers,
    simultaneousTriggers: remainingTriggers,
    triggerOrderingGroup: orderingGroup,
    accumulatedEvents: [],
  };

  const nextState = pushFrame(frameId.state, frame);
  if (isEngineTerminated(nextState)) return { state: nextState };

  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "PLAYER_CHOICE",
      effectDescription: "Choose which effect to activate first",
      sourceEffectDescription: (() => {
        const groupSourceInstanceId =
          orderingGroup.triggers[0]?.groupSourceInstanceId;
        if (!groupSourceInstanceId) return undefined;
        const sourceCard = findCardInstance(state, groupSourceInstanceId);
        if (sourceCard) return cardDb.get(sourceCard.cardId)?.name;
        const sourceEvent = [...state.eventLog].reverse().find((event) => {
          const payload = event.payload as
            | { cardInstanceId?: string }
            | undefined;
          return payload?.cardInstanceId === groupSourceInstanceId;
        });
        const sourceCardId = (sourceEvent?.payload as { cardId?: string })
          ?.cardId;
        if (sourceCardId) return cardDb.get(sourceCardId)?.name;
        const sourceFrame = [...state.effectStack]
          .reverse()
          .find(
            (frame) => frame.sourceCardInstanceId === groupSourceInstanceId
          );
        if (!sourceFrame) return undefined;
        const batchAction = sourceFrame.batchResumeMarker?.pausedAction;
        for (const cardData of cardDb.values()) {
          if (
            cardData.effectSchema?.effects.some(
              (effect) =>
                effect.id === sourceFrame.effectBlock.id ||
                (batchAction &&
                  effect.actions?.some(
                    (action) =>
                      action.type === batchAction.type &&
                      JSON.stringify(action.target) ===
                        JSON.stringify(batchAction.target)
                  ))
            )
          ) {
            return cardData.name;
          }
        }
        return undefined;
      })(),
      choices,
      confirmOrSkip: true,
    },
    respondingPlayer: controller,
    resumeContext: frame.id,
  };

  return { state: nextState, pendingPrompt };
}

export function withStableOrderingIds(triggers: QueuedTrigger[]): QueuedTrigger[] {
  const occurrences = new Map<string, number>();
  return triggers.map((trigger) => {
    if (trigger.orderingId) return trigger;
    const pair = `${trigger.sourceCardInstanceId}:${trigger.effectBlock.id}`;
    const occurrence = occurrences.get(pair) ?? 0;
    occurrences.set(pair, occurrence + 1);
    return {
      ...trigger,
      orderingId: `${pair}:${occurrence}`,
    };
  });
}
