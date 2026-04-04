/**
 * POST /api/game/result — Called by the Cloudflare DO when a game ends.
 * Updates the GameSession record in PostgreSQL with the final result.
 * Protected by the GAME_WORKER_SECRET shared secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GameResultSchema } from "@/lib/validators/game";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST(request: NextRequest) {
  // Auth: verify the request comes from our Cloudflare Worker
  const auth = request.headers.get("Authorization");
  if (!GAME_WORKER_SECRET || auth !== `Bearer ${GAME_WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseBody(request, GameResultSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { gameId, status, winnerId, winReason } = parsed;

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Game result update error:", error);
    return NextResponse.json({ error: "Failed to update game result" }, { status: 500 });
  }
}
