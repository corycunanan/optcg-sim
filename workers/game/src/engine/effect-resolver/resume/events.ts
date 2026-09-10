import {
  generateFrameId,
  pushFrame,
  CONTINUATION_EFFECT_BLOCK,
} from "../../effect-stack.js";
import { emitPendingEvent, withEventLogEmitted } from "../../events.js";
import type { GameState, PendingEvent } from "../../../types.js";

/** Retain events until both independent propagation obligations are complete.
 * Publication can precede a prompt while trigger scanning still belongs to the
 * resumed continuation; an emitted event is not necessarily finished work.
 */
export function pendingPropagationEvents(
  events: readonly PendingEvent[]
): PendingEvent[] {
  return events.filter(
    (event) =>
      !event.propagation?.eventLogEmitted || !event.propagation?.triggerScanned
  );
}

/**
 * Transfer an outer continuation's events into the first frame pushed by its
 * successor. Chain results and frames can share the same event references;
 * retain those once, without conflating distinct events with equal payloads.
 * A nested frame above the successor retains ownership of its own events.
 */
export function retainEventsOnFrame(
  state: GameState,
  frameIndex: number,
  events: readonly PendingEvent[]
): GameState {
  const frame = state.effectStack[frameIndex];
  if (!frame) return state;
  const nestedEvents = new Set(
    state.effectStack
      .slice(frameIndex + 1)
      .flatMap((nested) => nested.accumulatedEvents)
  );
  const accumulatedEvents = [
    ...new Set([
      ...pendingPropagationEvents(events),
      ...pendingPropagationEvents(frame.accumulatedEvents),
    ]),
  ].filter((event) => !nestedEvents.has(event));
  return {
    ...state,
    effectStack: state.effectStack.map((existing, index) =>
      index === frameIndex ? { ...existing, accumulatedEvents } : existing
    ),
  };
}

/** Detach committed outer events at an accepted continuation publication boundary. */
export function takeInterruptedEvents(state: GameState): {
  state: GameState;
  events: PendingEvent[];
} {
  const events: PendingEvent[] = [];
  const effectStack = state.effectStack.map((frame) => {
    if (frame.phase !== "INTERRUPTED_BY_TRIGGERS") return frame;
    events.push(...pendingPropagationEvents(frame.accumulatedEvents));
    return { ...frame, accumulatedEvents: [] };
  });
  return { state: events.length ? { ...state, effectStack } : state, events };
}

/** Publish a caller-owned committed accumulator without mutating event objects. */
export function publishCommittedEvents(
  state: GameState,
  events: PendingEvent[]
): GameState {
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.propagation?.eventLogEmitted) continue;
    state = emitPendingEvent(state, event, state.turn.activePlayerIndex);
    events[index] = withEventLogEmitted(event);
  }
  return state;
}

/** A trigger drain may pause again after detaching an ancestor's event debt.
 * Keep that committed work below the new prompt, never in a staged cost frame.
 * Interrupted resumes scan their complete prefix even with no suffix actions.
 */
export function retainPropagationBeforePrompt(
  state: GameState,
  events: PendingEvent[]
): GameState {
  const pending = pendingPropagationEvents(events);
  if (pending.length === 0) return state;
  const ownerIndex = state.effectStack.findIndex(
    (frame) => frame.phase === "INTERRUPTED_BY_TRIGGERS"
  );
  if (ownerIndex >= 0) return retainEventsOnFrame(state, ownerIndex, pending);
  const child = state.effectStack.at(-1);
  if (!child) return state;
  const generated = generateFrameId(state);
  const withOwner = pushFrame(generated.state, {
    id: generated.id,
    sourceCardInstanceId: child.sourceCardInstanceId,
    controller: child.controller,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: pending,
  });
  if (withOwner.effectStack.length !== state.effectStack.length + 1)
    return withOwner;
  const owner = withOwner.effectStack.at(-1)!;
  return {
    ...withOwner,
    effectStack: [...state.effectStack.slice(0, -1), owner, child],
  };
}
