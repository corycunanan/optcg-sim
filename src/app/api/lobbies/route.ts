/**
 * POST /api/lobbies — Create a lobby with a join code.
 * Returns { lobbyId, joinCode } for the host to share.
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { generateLobbyCode } from "@/lib/lobbies";
import {
  isActiveLobbyConflict,
  isJoinCodeCollision,
} from "@/lib/lobbies/unique-constraints";
import { CreateLobbySchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-create:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, CreateLobbySchema);
    if (isErrorResponse(parsed)) return parsed;
    const { deckId, format } = parsed;

    if (deckId) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId },
        select: { id: true },
      });
      if (!deck) return apiError("Deck not found", 404);
    }

    // Close any existing WAITING lobby by this host
    await prisma.lobby.updateMany({
      where: { hostUserId: userId, status: "WAITING" },
      data: { status: "CLOSED" },
    });

    let lobby = null;
    let attempts = 0;
    while (!lobby && attempts < 5) {
      attempts += 1;
      try {
        lobby = await prisma.lobby.create({
          data: {
            hostUserId: userId,
            hostDeckId: deckId ?? null,
            format: format || "Standard",
            mode: "PVP",
            joinCode: generateLobbyCode(),
          },
        });
      } catch (error) {
        if (isJoinCodeCollision(error)) {
          continue;
        }
        if (isActiveLobbyConflict(error)) {
          return apiError("An active lobby already exists", 409, {
            code: "ACTIVE_LOBBY_EXISTS",
          });
        }
        throw error;
      }
    }

    if (!lobby) {
      return apiError("Failed to generate unique lobby code", 500);
    }

    return apiSuccess({ lobbyId: lobby.id, joinCode: lobby.joinCode }, 201);
  } catch (error) {
    console.error("Lobby create error:", error);
    return apiError("Failed to create lobby", 500);
  }
}
