/**
 * POST /api/game/result — Called by the Cloudflare DO when a game ends.
 * Updates the GameSession record in PostgreSQL with the final result.
 * Protected by the GAME_WORKER_SECRET shared secret.
 */

import { NextRequest } from "next/server";
import { apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { GameResultSchema } from "@/lib/validators/game";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST(request: NextRequest) {
  // Auth: verify the request comes from our Cloudflare Worker
  const auth = request.headers.get("Authorization");
  if (!GAME_WORKER_SECRET || auth !== `Bearer ${GAME_WORKER_SECRET}`) {
    return apiError("Unauthorized", 401);
  }

  const parsed = await parseBody(request, GameResultSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { gameId, status, winnerId, winReason } = parsed;

  // Defense-in-depth if GAME_WORKER_SECRET leaks: cap writes per game.
  const { limited } = await apiLimiter.check(`game-result:${gameId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    await prisma.gameSession.update({
      where: { id: gameId },
      data: {
        status,
        winnerId: winnerId ?? null,
        winReason: winReason ?? null,
        endedAt: new Date(),
      },
    });

    return apiAction();
  } catch (error) {
    console.error("Game result update error:", error);
    return apiError("Failed to update game result", 500);
  }
}
