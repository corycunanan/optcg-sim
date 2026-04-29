/**
 * POST /api/lobbies/join — Join a lobby by code and auto-start the game.
 *
 * Body: { code: string, deckId: string }
 *
 * Creates a LobbyGuest record, a GameSession in PostgreSQL,
 * initializes the Durable Object, and returns { gameId } so the
 * guest can navigate directly to /game/{gameId}.
 *
 * The host discovers the game started via polling GET /api/lobbies/[id].
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { normalizeLobbyCode } from "@/lib/lobbies";
import { buildGameInitPayload } from "@/lib/game/init-payload";
import { JoinLobbySchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import {
  DECK_INVALID_CODE,
  DeckInvalidError,
  DeckNotFoundError,
  requirePlayableDeck,
} from "@/lib/decks/playable";

const GAME_WORKER_URL = process.env.GAME_WORKER_URL ?? "";
const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-join:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  if (!GAME_WORKER_URL || !GAME_WORKER_SECRET) {
    console.error("GAME_WORKER_URL or GAME_WORKER_SECRET not configured");
    return apiError("Game server not configured", 503);
  }

  try {
    const parsed = await parseBody(request, JoinLobbySchema);
    if (isErrorResponse(parsed)) return parsed;
    const { code, deckId } = parsed;

    const normalizedCode = normalizeLobbyCode(code);
    if (normalizedCode.length < 4) {
      return apiError("Invalid lobby code", 400);
    }

    const guestPlayableDeck = await requirePlayableDeck(deckId, userId);

    // Find the lobby by join code
    const lobby = await prisma.lobby.findFirst({
      where: { joinCode: normalizedCode, status: "WAITING" },
      include: {
        guest: true,
      },
    });

    if (!lobby) {
      return apiError("Lobby not found or already started", 404);
    }

    if (lobby.hostUserId === userId) {
      return apiError("You cannot join your own lobby", 409);
    }

    if (lobby.guest) {
      return apiError("Lobby already has a guest", 409);
    }

    if (!lobby.hostDeckId) {
      return apiError("Host has not selected a deck", 409);
    }

    const hostPlayableDeck = await requirePlayableDeck(
      lobby.hostDeckId,
      lobby.hostUserId,
    );

    // Atomically create LobbyGuest + GameSession + mark lobby IN_GAME.
    // Uses array-based $transaction (single round-trip, PgBouncer-safe)
    // so a concurrent join attempt fails on the unique lobbyId constraint
    // instead of creating orphaned records.
    const [, gameSession] = await prisma.$transaction([
      prisma.lobbyGuest.create({
        data: { lobbyId: lobby.id, userId, deckId },
      }),
      prisma.gameSession.upsert({
        where: { lobbyId: lobby.id },
        create: {
          lobbyId: lobby.id,
          player1Id: lobby.hostUserId,
          player2Id: userId,
          player1DeckId: lobby.hostDeckId,
          player2DeckId: deckId,
          format: lobby.format,
          mode: lobby.mode,
          status: "IN_PROGRESS",
        },
        update: { status: "IN_PROGRESS" },
      }),
      prisma.lobby.update({
        where: { id: lobby.id },
        data: { status: "IN_GAME" },
      }),
    ]);

    const payload = buildGameInitPayload({
      gameId: gameSession.id,
      format: lobby.format,
      player1: {
        userId: lobby.hostUserId,
        leader: hostPlayableDeck.leader,
        deck: hostPlayableDeck.deck,
      },
      player2: {
        userId,
        leader: guestPlayableDeck.leader,
        deck: guestPlayableDeck.deck,
      },
    });

    // Initialize the Durable Object
    const workerRes = await fetch(`${GAME_WORKER_URL}/game/${gameSession.id}/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GAME_WORKER_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    if (!workerRes.ok) {
      const workerErr = await workerRes.text().catch(() => "unknown");
      console.error("Worker init failed:", workerRes.status, workerErr);
      // Roll back all 3 records so the lobby returns to WAITING and can be re-joined.
      await prisma.$transaction([
        prisma.gameSession.delete({ where: { id: gameSession.id } }),
        prisma.lobbyGuest.delete({ where: { lobbyId: lobby.id } }),
        prisma.lobby.update({ where: { id: lobby.id }, data: { status: "WAITING" } }),
      ]).catch((e) => console.error("Rollback failed:", e));
      return apiError("Failed to initialize game server", 502);
    }

    return apiSuccess({ gameId: gameSession.id });
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
    console.error("Lobby join error:", error);
    return apiError("Failed to join lobby", 500);
  }
}
