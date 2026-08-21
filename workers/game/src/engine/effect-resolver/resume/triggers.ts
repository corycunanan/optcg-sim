/**
 * processRemainingTriggers — drains queued triggers per turn-player priority
 * (§8-6). 2+ same-player triggers prompt for ordering; otherwise resolve in
 * queue order. After all triggers drain, re-enters any AWAITING_BATCH_RESUME
 * frame on top of the stack (OPT-172).
 */

import type {
  CardData,
  GameState,
  PendingEvent,
  QueuedTrigger,
} from "../../../types.js";
import { peekFrame, updateTopFrame } from "../../effect-stack.js";
import {
  emitEvent,
  replacePendingEventReferences,
  withEventLogEmitted,
} from "../../events.js";
import { buildTriggerSelectionPrompt } from "../../trigger-ordering.js";
import type { EffectResolverResult, EffectResolverServices } from "../types.js";

export function processRemainingTriggers(
  state: GameState,
  pendingTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  services: EffectResolverServices,
  priorEvents: PendingEvent[] = []
): EffectResolverResult {
  const events = [...priorEvents];
  let nextState = state;

  if (pendingTriggers.length === 0) {
    return services.reenterBatchResume(nextState, cardDb, events);
  }

  // Group by controller — turn player resolves first (§8-6),
  // and within each group the player chooses order when 2+.
  const activePI = nextState.turn.activePlayerIndex;
  const turnPlayerTriggers = pendingTriggers.filter(
    (t) => t.controller === activePI
  );
  const nonTurnPlayerTriggers = pendingTriggers.filter(
    (t) => t.controller !== activePI
  );

  // Turn player has 2+ triggers — prompt for ordering
  if (turnPlayerTriggers.length >= 2) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState,
      turnPlayerTriggers,
      nonTurnPlayerTriggers,
      cardDb
    );
    return {
      state: promptResult.state,
      events,
      resolved: false,
      pendingPrompt: promptResult.pendingPrompt,
    };
  }

  // Resolve turn player's 0–1 triggers first
  for (const trigger of turnPlayerTriggers) {
    const result = services.resolveEffect(
      nextState,
      trigger.effectBlock,
      trigger.sourceCardInstanceId,
      trigger.controller,
      cardDb,
      (
        trigger.triggeringEvent?.payload as
          | { cardInstanceId?: string }
          | undefined
      )?.cardInstanceId ?? null
    );
    nextState = result.state;
    events.push(...result.events);

    if (result.pendingPrompt) {
      const topFrame = peekFrame(nextState);
      if (topFrame) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: nonTurnPlayerTriggers,
        });
      }
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: result.pendingPrompt,
      };
    }

    // Emit events from this trigger's resolution
    for (const event of result.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? trigger.controller,
        event.payload ?? {}
      );
      // A later continuation-pipeline pass may still need to match nested
      // triggers from this event, but it must not duplicate the event log.
    }
    replacePendingEventReferences(
      events,
      result.events,
      result.events.map(withEventLogEmitted)
    );
  }

  // Non-turn player has 2+ triggers — prompt for ordering
  if (nonTurnPlayerTriggers.length >= 2) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState,
      nonTurnPlayerTriggers,
      [],
      cardDb
    );
    return {
      state: promptResult.state,
      events,
      resolved: false,
      pendingPrompt: promptResult.pendingPrompt,
    };
  }

  // Resolve non-turn player's 0–1 triggers
  for (const trigger of nonTurnPlayerTriggers) {
    const result = services.resolveEffect(
      nextState,
      trigger.effectBlock,
      trigger.sourceCardInstanceId,
      trigger.controller,
      cardDb,
      (
        trigger.triggeringEvent?.payload as
          | { cardInstanceId?: string }
          | undefined
      )?.cardInstanceId ?? null
    );
    nextState = result.state;
    events.push(...result.events);

    if (result.pendingPrompt) {
      const topFrame = peekFrame(nextState);
      if (topFrame) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: [],
        });
      }
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: result.pendingPrompt,
      };
    }

    // Emit events from this trigger's resolution
    for (const event of result.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? trigger.controller,
        event.payload ?? {}
      );
    }
    replacePendingEventReferences(
      events,
      result.events,
      result.events.map(withEventLogEmitted)
    );
  }

  // OPT-172: once all triggers for this batch boundary drain, re-enter any
  // AWAITING_BATCH_RESUME frame on top so the multi-target action can continue
  // with its remaining frames.
  return services.reenterBatchResume(nextState, cardDb, events);
}
