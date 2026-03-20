/**
 * POST /api/game/result — Called by the Cloudflare DO when a game ends.
 * Updates the GameSession record in PostgreSQL with the final result.
 * Protected by the GAME_WORKER_SECRET shared secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

interface GameResultBody {
  gameId: string;
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winnerId: string | null;
  winReason: string | null;
}

export async function POST(request: NextRequest) {
  // Auth: verify the request comes from our Cloudflare Worker
  const auth = request.headers.get("Authorization");
  if (!GAME_WORKER_SECRET || auth !== `Bearer ${GAME_WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GameResultBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { gameId, status, winnerId, winReason } = body;

  if (!gameId || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Game result update error:", error);
    return NextResponse.json({ error: "Failed to update game result" }, { status: 500 });
  }
}
