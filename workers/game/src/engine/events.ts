/**
 * Event Bus
 *
 * Every completed action (pipeline step 4) appends a typed GameEvent to the
 * state's eventLog. M4's trigger system scans this log to fire card effects.
 * In M3, only keyword handlers observe events.
 */

import type { GameEvent, GameEventType, GameState } from "../types.js";

export function emitEvent(
  state: GameState,
  type: GameEventType,
  playerIndex: 0 | 1,
  payload: Record<string, unknown> = {},
): GameState {
  const event: GameEvent = {
    type,
    playerIndex,
    payload,
    timestamp: Date.now(),
  };
  return {
    ...state,
    eventLog: [...state.eventLog, event],
  };
}
