/**
 * Event Bus
 *
 * Every completed action (pipeline step 4) appends a typed GameEvent to the
 * state's eventLog. M4's trigger system scans this log to fire card effects.
 * In M3, only keyword handlers observe events.
 */

import type { GameEvent, GameEventType, GameEventPayloadMap, GameState, PendingEvent } from "../types.js";

export function emitEvent<T extends GameEventType>(
  state: GameState,
  type: T,
  playerIndex: 0 | 1,
  payload: GameEventPayloadMap[T] = {} as GameEventPayloadMap[T],
): GameState {
  const event = {
    type,
    playerIndex,
    payload,
    timestamp: Date.now(),
  } as GameEvent;
  return {
    ...state,
    eventLog: [...state.eventLog, event],
  };
}

/**
 * Emit a PendingEvent (pre-timestamp event from engine internals).
 * Resolves the correlated-types issue when iterating PendingEvent arrays.
 */
export function emitPendingEvent(
  state: GameState,
  event: PendingEvent,
  defaultPlayerIndex: 0 | 1,
): GameState {
  // Safe cast: PendingEvent's type and payload are already correlated by the discriminated union
  return emitEvent(
    state,
    event.type as GameEventType,
    event.playerIndex ?? defaultPlayerIndex,
    (event.payload ?? {}) as GameEventPayloadMap[typeof event.type],
  );
}
