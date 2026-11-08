import { log } from "../lib/log.js";
import type { GameAction } from "../types.js";

/** OPT-929: the sender-facing rejection for an unexpected engine exception. */
export const ENGINE_ERROR_REJECTION = "Internal engine error; game state unchanged";

export type EngineAttempt<T> = { ok: true; value: T } | { ok: false };

/**
 * Run one engine step for a session command (OPT-929). An unexpected throw is
 * logged with a stable prefix and the action type and reported as `ok: false`,
 * so the caller can keep state and undo history, skip persistence and send
 * the sender one `action:rejected` with `ENGINE_ERROR_REJECTION`.
 */
export function attemptEngineStep<T>(
  gameId: string,
  action: GameAction,
  step: () => T
): EngineAttempt<T> {
  try {
    return { ok: true, value: step() };
  } catch (error) {
    log("session.engine_error", {
      gameId,
      actionType: action.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false };
  }
}
