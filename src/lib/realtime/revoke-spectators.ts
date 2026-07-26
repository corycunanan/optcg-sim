import { prisma } from "@/lib/db";
import {
  gameWorkerFetch,
  isGameWorkerConfigured,
  type GameWorkerClientDeps,
} from "@/lib/game-worker/client";

const REVOCATION_TIMEOUT_MS = 2_000;

export interface RevokeSpectatorDeps extends GameWorkerClientDeps {
  findGameId?: (lobbyId: string) => Promise<string | null>;
  logger?: (message: string, fields: Record<string, unknown>) => void;
}

/** Best-effort fast path; the token-expiry lease remains the correctness bound. */
export async function revokeSpectatorSocketsForLobby(
  lobbyId: string,
  removedSpectatorUserIds: readonly string[],
  deps: RevokeSpectatorDeps = {}
): Promise<void> {
  const userIds = Array.from(new Set(removedSpectatorUserIds));
  if (userIds.length === 0) return;

  const logger = deps.logger ?? defaultLogger;
  if (!isGameWorkerConfigured(deps)) {
    logger("spectator revocation misconfigured", {
      source: "realtime.revoke-spectators",
      lobbyId,
      reason: "missing_worker_url_or_secret",
    });
    return;
  }

  try {
    const gameId = deps.findGameId
      ? await deps.findGameId(lobbyId)
      : (
          await prisma.gameSession.findFirst({
            where: { lobbyId },
            orderBy: { startedAt: "desc" },
            select: { id: true },
          })
        )?.id ?? null;
    if (!gameId) return;

    const response = await gameWorkerFetch(
      `/game/${encodeURIComponent(gameId)}/revoke-spectators`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
        timeoutMs: REVOCATION_TIMEOUT_MS,
      },
      deps
    );
    if (!response.ok) {
      logger("spectator revocation non-ok response", {
        source: "realtime.revoke-spectators",
        lobbyId,
        gameId,
        status: response.status,
      });
    }
  } catch (error) {
    logger("spectator revocation failed", {
      source: "realtime.revoke-spectators",
      lobbyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function defaultLogger(message: string, fields: Record<string, unknown>): void {
  console.warn(message, fields);
}
