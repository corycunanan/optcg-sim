/**
 * GET /api/game/[id]  — Read game session status for a participant
 * POST /api/game/[id] — Resolve a stuck game when websocket recovery fails
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { GameActionSchema } from "@/lib/validators/game";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

const GAME_WORKER_URL = process.env.GAME_WORKER_URL ?? "";
const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

type WinnerPerspective = "SELF" | "OPPONENT" | "NONE";

function getWinnerPerspective(winnerId: string | null, userId: string): WinnerPerspective {
  if (!winnerId) return "NONE";
  return winnerId === userId ? "SELF" : "OPPONENT";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const game = await prisma.gameSession.findFirst({
    where: {
      id,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: {
      id: true,
      status: true,
      winnerId: true,
      winReason: true,
      player1Id: true,
      player2Id: true,
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: game.id,
      status: game.status,
      winnerId: game.winnerId,
      winReason: game.winReason,
      winnerPerspective: getWinnerPerspective(game.winnerId, userId),
      canFallbackConcede: game.status === "IN_PROGRESS",
      playerIndex: game.player1Id === userId ? 0 : 1,
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const { limited } = await apiLimiter.check(`game-action:${userId}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const { id } = await params;

  const parsed = await parseBody(request, GameActionSchema);
  if (isErrorResponse(parsed)) return parsed;

  if (parsed.action === "FINALIZE") {
    return handleFinalize(id, userId, parsed);
  }

  return handleConcede(id, userId);
}

/**
 * FINALIZE — Client-driven game end notification.
 * The game board calls this when it receives game:over from the websocket,
 * serving as a reliable backup for the worker→Next.js callback which can
 * fail in local dev (Miniflare can't reach localhost:3000).
 */
async function handleFinalize(
  gameId: string,
  userId: string,
  body: { winnerId?: string | null; winReason?: string | null },
) {
  const game = await prisma.gameSession.findFirst({
    where: {
      id: gameId,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true, status: true, player1Id: true, player2Id: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Already resolved — return success without modifying
  if (game.status !== "IN_PROGRESS") {
    return NextResponse.json({
      data: { id: game.id, status: game.status, finalized: false },
    });
  }

  // Validate winnerId is one of the two participants (or null for abandonment)
  const { winnerId, winReason } = body;
  if (winnerId != null && winnerId !== game.player1Id && winnerId !== game.player2Id) {
    return NextResponse.json({ error: "Invalid winnerId" }, { status: 400 });
  }

  const updated = await prisma.gameSession.update({
    where: { id: game.id },
    data: {
      status: "FINISHED",
      winnerId: winnerId ?? null,
      winReason: winReason ?? "Game ended",
      endedAt: new Date(),
    },
    select: { id: true, status: true, winnerId: true, winReason: true },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      winnerId: updated.winnerId,
      winReason: updated.winReason,
      winnerPerspective: getWinnerPerspective(updated.winnerId, userId),
      finalized: true,
    },
  });
}

async function handleConcede(gameId: string, userId: string) {
  const game = await prisma.gameSession.findFirst({
    where: {
      id: gameId,
      status: "IN_PROGRESS",
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true, player1Id: true, player2Id: true },
  });

  if (!game) {
    return NextResponse.json({ error: "Active game not found" }, { status: 404 });
  }

  const winnerId = game.player1Id === userId ? game.player2Id : game.player1Id;
  const updated = await prisma.gameSession.update({
    where: { id: game.id },
    data: {
      status: "FINISHED",
      winnerId,
      winReason: "Player conceded while disconnected",
      endedAt: new Date(),
    },
    select: { id: true, status: true, winnerId: true, winReason: true },
  });

  const winnerIndex = winnerId === game.player1Id ? 0 : 1;
  if (GAME_WORKER_URL && GAME_WORKER_SECRET) {
    void fetch(`${GAME_WORKER_URL}/game/${game.id}/notify-end`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GAME_WORKER_SECRET}`,
      },
      body: JSON.stringify({
        winnerIndex,
        reason: updated.winReason ?? "Player conceded while disconnected",
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      winnerId: updated.winnerId,
      winReason: updated.winReason,
      winnerPerspective: getWinnerPerspective(updated.winnerId, userId),
      canFallbackConcede: false,
    },
  });
}
