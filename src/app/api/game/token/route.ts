/**
 * GET /api/game/token?gameId=<id> — Issues a short-lived HS256 game token for the caller.
 * Passed to the Cloudflare DO as ?token=<jwt> on WebSocket connect.
 *
 * We don't forward NextAuth's own JWE token to the worker because @auth/core
 * produces encrypted JWEs (A256CBC-HS512), which are non-trivial to verify in
 * a Cloudflare Worker. Instead we mint a simple HS256 token signed with
 * GAME_WORKER_SECRET — a shared secret both sides already have.
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { mintGameToken } from "@/lib/game/token";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;
  const gameId = request.nextUrl.searchParams.get("gameId");

  if (!gameId) {
    return apiError("gameId is required", 400);
  }

  if (!GAME_WORKER_SECRET) {
    return apiError("Game server not configured", 503);
  }

  const game = await prisma.gameSession.findFirst({
    where: {
      id: gameId,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true },
  });

  if (!game) {
    return apiError("Game not found", 404);
  }

  const token = await mintGameToken(userId, GAME_WORKER_SECRET, { gameId: game.id });
  return apiSuccess({ token });
}
