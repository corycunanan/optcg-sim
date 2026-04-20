/**
 * processRemainingTriggers — drains queued triggers per turn-player priority
 * (§8-6). 2+ same-player triggers prompt for ordering; otherwise resolve in
 * queue order. After all triggers drain, re-enters any AWAITING_BATCH_RESUME
 * frame on top of the stack (OPT-172).
 */

import type { EffectBlock } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  PendingEvent,
  EffectStackFrame,
  QueuedTrigger,
} from "../../../types.js";
import { peekFrame, updateTopFrame } from "../../effect-stack.js";
import { emitEvent } from "../../events.js";
import { buildTriggerSelectionPrompt } from "../../trigger-ordering.js";
import { resolveEffect } from "../resolver.js";
import type { EffectResolverResult } from "../types.js";
import { reenterBatchResume } from "./batch.js";

export function processRemainingTriggers(
  state: GameState,
  pendingTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  priorEvents: PendingEvent[] = [],
): EffectResolverResult {
  const events = [...priorEvents];
  let nextState = state;

  if (pendingTriggers.length === 0) {
    return { state: nextState, events, resolved: true };
  }

  // Group by controller — turn player resolves first (§8-6),
  // and within each group the player chooses order when 2+.
  const activePI = nextState.turn.activePlayerIndex;
  const turnPlayerTriggers = pendingTriggers.filter(t => t.controller === activePI);
  const nonTurnPlayerTriggers = pendingTriggers.filter(t => t.controller !== activePI);

  // Turn player has 2+ triggers — prompt for ordering
  if (turnPlayerTriggers.length >= 2) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState, turnPlayerTriggers, nonTurnPlayerTriggers, cardDb,
    );
    return { state: promptResult.state, events, resolved: false, pendingPrompt: promptResult.pendingPrompt };
  }

  // Resolve turn player's 0–1 triggers first
  for (const trigger of turnPlayerTriggers) {
    const result = resolveEffect(
      nextState,
      trigger.effectBlock as EffectBlock,
      trigger.sourceCardInstanceId,
      trigger.controller,
      cardDb,
    );
    nextState = result.state;
    events.push(...result.events);

    if (result.pendingPrompt) {
      const topFrame = peekFrame(nextState) as EffectStackFrame;
      if (topFrame) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: nonTurnPlayerTriggers,
        });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: result.pendingPrompt };
    }

    // Emit events from this trigger's resolution
    for (const event of result.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? trigger.controller,
        event.payload ?? {},
      );
    }
  }

  // Non-turn player has 2+ triggers — prompt for ordering
  if (nonTurnPlayerTriggers.length >= 2) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState, nonTurnPlayerTriggers, [], cardDb,
    );
    return { state: promptResult.state, events, resolved: false, pendingPrompt: promptResult.pendingPrompt };
  }

  // Resolve non-turn player's 0–1 triggers
  for (const trigger of nonTurnPlayerTriggers) {
    const result = resolveEffect(
      nextState,
      trigger.effectBlock as EffectBlock,
      trigger.sourceCardInstanceId,
      trigger.controller,
      cardDb,
    );
    nextState = result.state;
    events.push(...result.events);

    if (result.pendingPrompt) {
      const topFrame = peekFrame(nextState) as EffectStackFrame;
      if (topFrame) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: [],
        });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: result.pendingPrompt };
    }

    // Emit events from this trigger's resolution
    for (const event of result.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? trigger.controller,
        event.payload ?? {},
      );
    }
  }

  // OPT-172: once all triggers for this batch boundary drain, re-enter any
  // AWAITING_BATCH_RESUME frame on top so the multi-target action can continue
  // with its remaining frames.
  return reenterBatchResume(nextState, cardDb, events);
}
