/**
 * GET /api/game/token?gameId=<id>&playerIndex=<0|1> — Issues a short-lived
 * HS256 game token for the caller.
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
  const playerIndexParam = request.nextUrl.searchParams.get("playerIndex");

  if (!gameId) {
    return apiError("gameId is required", 400);
  }

  let requestedPlayerIndex: 0 | 1 | undefined;
  if (playerIndexParam !== null) {
    if (playerIndexParam !== "0" && playerIndexParam !== "1") {
      return apiError("playerIndex must be 0 or 1", 400);
    }
    requestedPlayerIndex = Number(playerIndexParam) as 0 | 1;
  }

  if (!GAME_WORKER_SECRET) {
    return apiError("Game server not configured", 503);
  }

  const game = await prisma.gameSession.findFirst({
    where: {
      id: gameId,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: {
      id: true,
      mode: true,
      player1Id: true,
      player2Id: true,
    },
  });

  if (!game) {
    return apiError("Game not found", 404);
  }

  const isOnlyUserOnGame =
    game.player1Id === userId && game.player2Id === userId;
  const playerIndex =
    requestedPlayerIndex !== undefined &&
    game.mode === "SOLITAIRE" &&
    isOnlyUserOnGame
      ? requestedPlayerIndex
      : undefined;

  const token = await mintGameToken(userId, GAME_WORKER_SECRET, {
    gameId: game.id,
    ...(playerIndex !== undefined ? { playerIndex } : {}),
  });
  return apiSuccess({ token });
}
