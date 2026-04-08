/**
 * GET /api/game/[id]  — Read game session status for a participant
 * POST /api/game/[id] — Resolve a stuck game when websocket recovery fails
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
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
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

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
    return apiError("Game not found", 404);
  }

  return apiSuccess({
    id: game.id,
    status: game.status,
    winnerId: game.winnerId,
    winReason: game.winReason,
    winnerPerspective: getWinnerPerspective(game.winnerId, userId),
    canFallbackConcede: game.status === "IN_PROGRESS",
    playerIndex: game.player1Id === userId ? 0 : 1,
  }, 200, { "Cache-Control": "no-store" });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`game-action:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  const parsed = await parseBody(request, GameActionSchema);
  if (isErrorResponse(parsed)) return parsed;

  if (parsed.action === "FINALIZE") {
    return handleFinalize(id, userId, parsed);
  }

  return handleConcede(id, userId);
}

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
    return apiError("Game not found", 404);
  }

  if (game.status !== "IN_PROGRESS") {
    return apiSuccess({ id: game.id, status: game.status, finalized: false });
  }

  const { winnerId, winReason } = body;
  if (winnerId != null && winnerId !== game.player1Id && winnerId !== game.player2Id) {
    return apiError("Invalid winnerId", 400);
  }

  // Optimistic locking: only update if still IN_PROGRESS (first writer wins)
  const result = await prisma.gameSession.updateMany({
    where: { id: game.id, status: "IN_PROGRESS" },
    data: {
      status: "FINISHED",
      winnerId: winnerId ?? null,
      winReason: winReason ?? "Game ended",
      endedAt: new Date(),
    },
  });

  if (result.count === 0) {
    // Another request already finalized this game
    const current = await prisma.gameSession.findUnique({
      where: { id: game.id },
      select: { id: true, status: true },
    });
    return apiSuccess({ id: game.id, status: current?.status ?? "FINISHED", finalized: false });
  }

  // Re-read to get the full updated record for the response
  const updated = await prisma.gameSession.findUnique({
    where: { id: game.id },
    select: { id: true, status: true, winnerId: true, winReason: true },
  });

  return apiSuccess({
    id: updated!.id,
    status: updated!.status,
    winnerId: updated!.winnerId,
    winReason: updated!.winReason,
    winnerPerspective: getWinnerPerspective(updated!.winnerId, userId),
    finalized: true,
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
    return apiError("Active game not found", 404);
  }

  const winnerId = game.player1Id === userId ? game.player2Id : game.player1Id;

  // Optimistic locking: only update if still IN_PROGRESS
  const result = await prisma.gameSession.updateMany({
    where: { id: game.id, status: "IN_PROGRESS" },
    data: {
      status: "FINISHED",
      winnerId,
      winReason: "Player conceded while disconnected",
      endedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return apiError("Game has already ended", 409);
  }

  const updated = await prisma.gameSession.findUniqueOrThrow({
    where: { id: game.id },
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

  return apiSuccess({
    id: updated.id,
    status: updated.status,
    winnerId: updated.winnerId,
    winReason: updated.winReason,
    winnerPerspective: getWinnerPerspective(updated.winnerId, userId),
    canFallbackConcede: false,
  });
}
