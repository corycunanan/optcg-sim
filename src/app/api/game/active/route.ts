/**
 * GET /api/game/active — Returns the current user's active game session, if any.
 * Used to show a "Rejoin" button when a player navigates away from an ongoing game.
 */

import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { searchLimiter } from "@/lib/rate-limit";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await searchLimiter.check(`game-active:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const game = await prisma.gameSession.findFirst({
    where: {
      status: "IN_PROGRESS",
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true },
    orderBy: { startedAt: "desc" },
  });

  return apiSuccess(game ?? null, 200, { "Cache-Control": "no-store" });
}
