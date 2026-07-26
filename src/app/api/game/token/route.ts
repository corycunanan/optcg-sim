/**
 * GET /api/game/token?gameId=<id>&playerIndex=<0|1> — Issues a short-lived
 * HS256 game token for the caller.
 * Passed to the Cloudflare DO as ?token=<jwt> on WebSocket connect.
 *
 * We don't forward NextAuth's own JWE token to the worker because @auth/core
 * produces encrypted JWEs (A256CBC-HS512), which are non-trivial to verify in
 * a Cloudflare Worker. Instead we mint a simple HS256 token signed with
 * GAME_WORKER_SECRET — a shared secret both sides already have.
 *
 * The worker has no database access, so a signed spectator role is its
 * authoritative authorization. Established spectator sockets carry exp as a
 * hibernation-stable lease, so server-side delivery is bounded by the 5-minute
 * token TTL even if a membership-change push is missed. An alarm also requests
 * physical socket close, whose timing is not numerically bounded. Lobby
 * mutations push prompt, revision-protected revocation to the game DO.
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
    requestedPlayerIndex = playerIndexParam === "0" ? 0 : 1;
  }

  if (!GAME_WORKER_SECRET) {
    return apiError("Game server not configured", 503);
  }

  const game = await prisma.gameSession.findFirst({
    // Deliberately omit a status filter to match OPT-560: an admitted
    // spectator may keep viewing a FINISHED or ABANDONED game.
    where: {
      id: gameId,
    },
    select: {
      id: true,
      mode: true,
      player1Id: true,
      player2Id: true,
      lobby: {
        select: {
          allowSpectators: true,
          spectators: {
            where: { userId },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!game) {
    return apiError("Game not found", 404);
  }

  const isPlayer = game.player1Id === userId || game.player2Id === userId;

  if (!isPlayer && game.lobby.spectators.length === 0) {
    return apiError("Game not found", 404);
  }

  if (!isPlayer && !game.lobby.allowSpectators) {
    return apiError("Spectating is disabled", 403);
  }

  if (!isPlayer) {
    const token = await mintGameToken(userId, GAME_WORKER_SECRET, {
      gameId: game.id,
      role: "spectator",
    });
    return apiSuccess({ token });
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
