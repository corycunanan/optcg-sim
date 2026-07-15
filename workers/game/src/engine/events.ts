/**
 * Event Bus
 *
 * Every completed action (pipeline step 4) appends a typed GameEvent to the
 * state's eventLog. M4's trigger system scans this log to fire card effects.
 * In M3, only keyword handlers observe events.
 */

import type { GameEvent, GameEventType, GameEventPayloadMap, GameState, PendingEvent } from "../types.js";
import { takeEngineTimestamp } from "./execution-context.js";

export function withTriggerScanned(event: PendingEvent): PendingEvent {
  if (event.propagation?.triggerScanned) return event;
  return {
    ...event,
    propagation: { ...event.propagation, triggerScanned: true },
  } as PendingEvent;
}

export function withEventLogEmitted(event: PendingEvent): PendingEvent {
  if (event.propagation?.eventLogEmitted) return event;
  return {
    ...event,
    propagation: { ...event.propagation, eventLogEmitted: true },
  } as PendingEvent;
}

/** Replace references inside a caller-owned accumulator with immutable copies. */
export function replacePendingEventReferences(
  accumulator: PendingEvent[],
  originals: PendingEvent[],
  replacements: PendingEvent[],
): void {
  for (let index = 0; index < accumulator.length; index++) {
    const originalIndex = originals.indexOf(accumulator[index]);
    if (originalIndex >= 0) accumulator[index] = replacements[originalIndex];
  }
}

/** Read an optional card identity without asserting a specific event payload. */
export function getEventCardInstanceId(
  event: { payload?: unknown } | null | undefined,
): string | undefined {
  const payload = event?.payload;
  if (typeof payload !== "object" || payload === null) return undefined;
  const instanceId = Reflect.get(payload, "cardInstanceId");
  return typeof instanceId === "string" ? instanceId : undefined;
}

export function emitEvent<T extends GameEventType>(
  state: GameState,
  type: T,
  playerIndex: 0 | 1,
  payload: GameEventPayloadMap[T] = {} as GameEventPayloadMap[T],
): GameState {
  const timed = takeEngineTimestamp(state);
  const event = {
    type,
    playerIndex,
    payload,
    timestamp: timed.timestamp,
  } as GameEvent;
  let turn = timed.state.turn;
  // Record K.O.s for ACTION_PERFORMED_THIS_TURN conditions (OP16-100
  // "if your opponent's Character has been K.O.'d during this turn").
  // playerIndex on CARD_KO is the K.O.'d character's owner.
  if (type === "CARD_KO") {
    turn = {
      ...turn,
      actionsPerformedThisTurn: [
        ...turn.actionsPerformedThisTurn,
        { actionType: "CHARACTER_KO", timestamp: event.timestamp, controller: playerIndex },
      ],
    };
  }
  return {
    ...timed.state,
    turn,
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
