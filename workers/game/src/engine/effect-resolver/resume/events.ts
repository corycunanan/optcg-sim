import type { GameState, PendingEvent } from "../../../types.js";

/** A continuation owns only events that have not reached the public log yet. */
export function unpublishedEvents(
  events: readonly PendingEvent[]
): PendingEvent[] {
  return events.filter((event) => !event.propagation?.eventLogEmitted);
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
      ...unpublishedEvents(events),
      ...unpublishedEvents(frame.accumulatedEvents),
    ]),
  ].filter((event) => !nestedEvents.has(event));
  return {
    ...state,
    effectStack: state.effectStack.map((existing, index) =>
      index === frameIndex ? { ...existing, accumulatedEvents } : existing
    ),
  };
}

/** Detach already committed outer events before a replacement publishes its result. */
export function takeInterruptedEvents(state: GameState): {
  state: GameState;
  events: PendingEvent[];
} {
  const events: PendingEvent[] = [];
  const effectStack = state.effectStack.map((frame) => {
    if (frame.phase !== "INTERRUPTED_BY_TRIGGERS") return frame;
    events.push(...unpublishedEvents(frame.accumulatedEvents));
    return { ...frame, accumulatedEvents: [] };
  });
  return { state: events.length ? { ...state, effectStack } : state, events };
}
