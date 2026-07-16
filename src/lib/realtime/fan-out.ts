/**
 * Server → UserChannel fanout helper.
 *
 * Posts a JSON event to the user's `UserChannel` Durable Object via
 * `POST ${GAME_WORKER_URL}/user/${userId}/notify`. Best-effort: a 2s timeout,
 * no retries, errors are logged and swallowed. The 60s reconciliation
 * backstop polls (T4–T7) catch any miss until the OPT-361 cleanup ticket.
 */

import type { RealtimeServerEvent } from "@/types/realtime";
import {
  gameWorkerFetch,
  isGameWorkerConfigured,
  type GameWorkerClientDeps,
} from "@/lib/game-worker/client";

const NOTIFY_TIMEOUT_MS = 2_000;

/** Test seam — production callers leave this undefined. */
export interface NotifyUserDeps extends GameWorkerClientDeps {
  /** Defaults to console.warn — useful for capturing structured logs in tests. */
  logger?: (message: string, fields: Record<string, unknown>) => void;
}

export async function notifyUser(
  targetUserId: string,
  event: RealtimeServerEvent,
  deps: NotifyUserDeps = {},
): Promise<void> {
  const log = deps.logger ?? defaultLogger;

  const eventType = event.type;

  if (!isGameWorkerConfigured(deps)) {
    log("realtime fanout misconfigured", {
      source: "realtime.fan-out",
      targetUserId,
      eventType,
      reason: "missing_worker_url_or_secret",
    });
    return;
  }

  try {
    const res = await gameWorkerFetch(
      `/user/${encodeURIComponent(targetUserId)}/notify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
        timeoutMs: NOTIFY_TIMEOUT_MS,
      },
      deps,
    );
    if (!res.ok) {
      log("realtime fanout non-ok response", {
        source: "realtime.fan-out",
        targetUserId,
        eventType,
        status: res.status,
      });
    }
  } catch (error) {
    log("realtime fanout failed", {
      source: "realtime.fan-out",
      targetUserId,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function defaultLogger(message: string, fields: Record<string, unknown>): void {
  console.warn(message, fields);
}
