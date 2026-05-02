/**
 * POST /api/lobbies/join — Join a lobby by code and enter the lobby room.
 *
 * Body: { code: string, deckId?: string }
 *
 * Creates a LobbyGuest record, marks the lobby READY, and returns { lobbyId }.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { normalizeLobbyCode } from "@/lib/lobbies";
import { JoinLobbySchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-join:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, JoinLobbySchema);
    if (isErrorResponse(parsed)) return parsed;
    const { code, deckId } = parsed;

    const normalizedCode = normalizeLobbyCode(code);
    if (normalizedCode.length < 4) {
      return apiError("Invalid lobby code", 400);
    }

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

    if (lobby.mode === "SOLITAIRE") {
      return apiError("This lobby is in solo mode and cannot be joined", 409);
    }

    if (lobby.mode === "PVCOMPUTER") {
      return apiError(
        "This lobby is in computer mode and cannot be joined",
        409
      );
    }

    // Enter the room only. Deck slots are mutable in the lobby room; deck
    // legality belongs to POST /api/lobbies/[id]/start.
    await prisma.$transaction([
      prisma.lobbyGuest.create({
        data: { lobbyId: lobby.id, userId, deckId },
      }),
      prisma.lobby.update({
        where: { id: lobby.id },
        data: { status: "READY" },
      }),
    ]);

    after(async () => {
      const state = await buildLobbyRoomState(lobby.id);
      if (!state) return;
      // Actor (the new guest) sees the join via the route response; only the
      // host needs the push.
      await notifyLobby(state, { actorUserId: userId });
    });

    return apiSuccess({ lobbyId: lobby.id });
  } catch (error) {
    console.error("Lobby join error:", error);
    return apiError("Failed to join lobby", 500);
  }
}
