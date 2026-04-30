/**
 * POST /api/lobbies/[id]/start — Host-only explicit game start.
 *
 * Validates mode-aware room prerequisites, runs deck legality for both seats,
 * creates the GameSession, and initializes the Durable Object.
 */

import { NextRequest } from "next/server";
import { requireAuth, apiError, apiSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { buildGameInitPayload } from "@/lib/game/init-payload";
import {
  DECK_INVALID_CODE,
  DeckInvalidError,
  DeckNotFoundError,
  requirePlayableDeck,
} from "@/lib/decks/playable";

const GAME_WORKER_URL = process.env.GAME_WORKER_URL ?? "";
const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

type RouteContext = { params: Promise<{ id: string }> };

type StartSeatConfig = {
  player1Id: string;
  player2Id: string;
  player1DeckId: string;
  player2DeckId: string;
  player1DeckOwnerId: string;
  player2DeckOwnerId: string;
};

export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-start:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const { id } = await params;
    const lobby = await prisma.lobby.findUnique({
      where: { id },
      include: {
        guest: true,
        gameSession: { select: { id: true } },
      },
    });

    if (!lobby || lobby.status === "CLOSED") {
      return apiError("Lobby not found", 404);
    }

    if (lobby.hostUserId !== userId) {
      return apiError("Forbidden", 403);
    }

    if (lobby.status === "IN_GAME") {
      return apiError("Lobby already started", 409, {
        code: "ALREADY_STARTED",
        gameId: lobby.gameSession?.id ?? null,
      });
    }

    if (lobby.mode === "PVCOMPUTER") {
      return apiError("PVComputer mode is not yet implemented", 501);
    }

    if (!GAME_WORKER_URL || !GAME_WORKER_SECRET) {
      console.error("GAME_WORKER_URL or GAME_WORKER_SECRET not configured");
      return apiError("Game server not configured", 503);
    }

    const seatConfig = validateStartPrerequisites(lobby);
    if (seatConfig instanceof Response) return seatConfig;

    const player1PlayableDeck = await requirePlayableDeck(
      seatConfig.player1DeckId,
      seatConfig.player1DeckOwnerId,
    );
    const player2PlayableDeck = await requirePlayableDeck(
      seatConfig.player2DeckId,
      seatConfig.player2DeckOwnerId,
    );

    const startResult = await prisma.$transaction(async (tx) => {
      const statusLock = await tx.lobby.updateMany({
        where: {
          id: lobby.id,
          status: lobby.status,
        },
        data: { status: "IN_GAME" },
      });

      if (statusLock.count !== 1) {
        const existing = await tx.gameSession.findUnique({
          where: { lobbyId: lobby.id },
          select: { id: true },
        });
        return { gameSession: existing, created: false };
      }

      const created = await tx.gameSession.create({
        data: {
          lobbyId: lobby.id,
          player1Id: seatConfig.player1Id,
          player2Id: seatConfig.player2Id,
          player1DeckId: seatConfig.player1DeckId,
          player2DeckId: seatConfig.player2DeckId,
          format: lobby.format,
          mode: lobby.mode,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });
      return { gameSession: created, created: true };
    });

    if (!startResult.gameSession) {
      return apiError("Lobby already started", 409, {
        code: "ALREADY_STARTED",
        gameId: null,
      });
    }

    if (!startResult.created) {
      return apiError("Lobby already started", 409, {
        code: "ALREADY_STARTED",
        gameId: startResult.gameSession.id,
      });
    }

    const payload = buildGameInitPayload({
      gameId: startResult.gameSession.id,
      format: lobby.format,
      mode: lobby.mode,
      player1: {
        userId: seatConfig.player1Id,
        leader: player1PlayableDeck.leader,
        deck: player1PlayableDeck.deck,
      },
      player2: {
        userId: seatConfig.player2Id,
        leader: player2PlayableDeck.leader,
        deck: player2PlayableDeck.deck,
      },
    });

    let workerRes: Response;
    try {
      workerRes = await fetch(`${GAME_WORKER_URL}/game/${startResult.gameSession.id}/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GAME_WORKER_SECRET}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Worker init request failed:", error);
      await prisma.$transaction([
        prisma.gameSession.delete({ where: { id: startResult.gameSession.id } }),
        prisma.lobby.update({
          where: { id: lobby.id },
          data: { status: lobby.status },
        }),
      ]).catch((e) => console.error("Rollback failed:", e));
      return apiError("Failed to initialize game server", 502);
    }

    if (!workerRes.ok) {
      const workerErr = await workerRes.text().catch(() => "unknown");
      console.error("Worker init failed:", workerRes.status, workerErr);
      await prisma.$transaction([
        prisma.gameSession.delete({ where: { id: startResult.gameSession.id } }),
        prisma.lobby.update({
          where: { id: lobby.id },
          data: { status: lobby.status },
        }),
      ]).catch((e) => console.error("Rollback failed:", e));
      return apiError("Failed to initialize game server", 502);
    }

    return apiSuccess({ gameId: startResult.gameSession.id });
  } catch (error) {
    if (error instanceof DeckNotFoundError) {
      return apiError("Deck not found", 404);
    }
    if (error instanceof DeckInvalidError) {
      return apiError("Deck is not playable", 422, {
        code: DECK_INVALID_CODE,
        details: error.details,
      });
    }
    console.error("Lobby start error:", error);
    return apiError("Failed to start lobby", 500);
  }
}

function validateStartPrerequisites(lobby: {
  id: string;
  status: string;
  mode: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
  hostUserId: string;
  hostDeckId: string | null;
  hostReady: boolean;
  guest: {
    userId: string;
    deckId: string | null;
    guestReady: boolean;
  } | null;
}): StartSeatConfig | Response {
  const missing: string[] = [];

  if (lobby.mode === "PVP") {
    if (lobby.status !== "READY") missing.push("lobby.status");
    if (!lobby.guest || lobby.guest.userId === lobby.hostUserId) {
      missing.push("guest");
    }
    if (!lobby.hostDeckId) missing.push("hostDeckId");
    if (!lobby.guest?.deckId) missing.push("guestDeckId");
    if (!lobby.hostReady) missing.push("hostReady");
    if (!lobby.guest?.guestReady) missing.push("guestReady");

    if (missing.length > 0 || !lobby.guest || !lobby.hostDeckId || !lobby.guest.deckId) {
      return apiError("Lobby is not ready to start", 409, {
        code: "LOBBY_NOT_READY",
        details: { missing },
      });
    }

    return {
      player1Id: lobby.hostUserId,
      player2Id: lobby.guest.userId,
      player1DeckId: lobby.hostDeckId,
      player2DeckId: lobby.guest.deckId,
      player1DeckOwnerId: lobby.hostUserId,
      player2DeckOwnerId: lobby.guest.userId,
    };
  }

  if (!lobby.hostDeckId) missing.push("hostDeckId");
  if (!lobby.guest || lobby.guest.userId !== lobby.hostUserId) {
    missing.push("hostGuestSeat");
  }
  if (!lobby.guest?.deckId) missing.push("guestDeckId");
  if (!lobby.hostReady) missing.push("hostReady");

  if (missing.length > 0 || !lobby.guest || !lobby.hostDeckId || !lobby.guest.deckId) {
    return apiError("Lobby is not ready to start", 409, {
      code: "LOBBY_NOT_READY",
      details: { missing },
    });
  }

  return {
    player1Id: lobby.hostUserId,
    player2Id: lobby.hostUserId,
    player1DeckId: lobby.hostDeckId,
    player2DeckId: lobby.guest.deckId,
    player1DeckOwnerId: lobby.hostUserId,
    player2DeckOwnerId: lobby.hostUserId,
  };
}
