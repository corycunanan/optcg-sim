/**
 * Fanout helper for game session status changes.
 *
 * Loads the two player ids from `GameSession` and calls `notifyUser` for
 * each with `{ type: "game:status", gameId, status, winnerId, winReason }`.
 * Solitaire mode collapses to a single recipient via `Set` dedup.
 *
 * Per-recipient derived fields (`winnerPerspective`, `canFallbackConcede`)
 * are recomputed by the consumer hook from `winnerId` + `session.user.id`,
 * so the wire payload is identical for both recipients.
 */

import { prisma as defaultPrisma } from "@/lib/db";
import { notifyUser, type NotifyUserDeps } from "./fan-out";

export interface NotifyGameDetails {
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winnerId: string | null;
  winReason: string | null;
}

interface PrismaGameLookup {
  gameSession: {
    findUnique: (args: {
      where: { id: string };
      select: { player1Id: true; player2Id: true };
    }) => Promise<{ player1Id: string; player2Id: string } | null>;
  };
}

export interface NotifyGameOptions {
  /** Test seam — production callers leave this undefined. */
  prisma?: PrismaGameLookup;
  deps?: NotifyUserDeps;
}

export async function notifyGame(
  gameId: string,
  details: NotifyGameDetails,
  options: NotifyGameOptions = {},
): Promise<void> {
  const db = options.prisma ?? (defaultPrisma as unknown as PrismaGameLookup);
  const game = await db.gameSession.findUnique({
    where: { id: gameId },
    select: { player1Id: true, player2Id: true },
  });
  if (!game) return;

  const event = {
    type: "game:status" as const,
    gameId,
    status: details.status,
    winnerId: details.winnerId,
    winReason: details.winReason,
  };

  // Set dedupes the Solitaire case (player1Id === player2Id) so the host
  // gets at most one fanout per status change.
  const targets = Array.from(new Set([game.player1Id, game.player2Id]));

  await Promise.all(
    targets.map((userId) => notifyUser(userId, event, options.deps)),
  );
}
