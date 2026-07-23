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
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
} from "@/lib/lobbies/active-membership";

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

    const result = await prisma.$transaction(async (tx) => {
      const lobby = await tx.lobby.findFirst({
        where: { joinCode: normalizedCode },
        include: { guest: true },
      });

      if (!lobby || lobby.status !== "WAITING") {
        return { kind: "not_found" as const };
      }
      if (lobby.hostUserId === userId) return { kind: "self" as const };
      if (lobby.guest) return { kind: "occupied" as const };
      if (lobby.mode === "SOLITAIRE") return { kind: "solitaire" as const };
      if (lobby.mode === "PVCOMPUTER") return { kind: "computer" as const };

      // READY is acquired conditionally in the same transaction as the seat.
      // If close commits CLOSED after the read above, this re-check returns 0
      // and no guest row can be created or lobby state resurrected.
      const acquired = await tx.lobby.updateMany({
        where: {
          id: lobby.id,
          status: "WAITING",
          mode: "PVP",
          guest: { is: null },
        },
        data: { status: "READY", revision: { increment: 1 } },
      });
      if (acquired.count !== 1) return { kind: "not_found" as const };

      await claimActiveLobby(tx, userId, lobby.id);

      // Enter the room only. Deck slots are mutable in the lobby room; deck
      // legality belongs to POST /api/lobbies/[id]/start.
      await tx.lobbyGuest.create({
        data: { lobbyId: lobby.id, userId, deckId },
      });
      return { kind: "joined" as const, lobbyId: lobby.id };
    });

    switch (result.kind) {
      case "not_found":
        return apiError("Lobby not found or already started", 404);
      case "self":
        return apiError("You cannot join your own lobby", 409);
      case "occupied":
        return apiError("Lobby already has a guest", 409);
      case "solitaire":
        return apiError("This lobby is in solo mode and cannot be joined", 409);
      case "computer":
        return apiError(
          "This lobby is in computer mode and cannot be joined",
          409,
        );
    }

    const joinedLobbyId = result.lobbyId;

    after(async () => {
      const state = await buildLobbyRoomState(joinedLobbyId);
      if (!state) return;
      // Actor (the new guest) sees the join via the route response; only the
      // host needs the push.
      await notifyLobby(state, { actorUserId: userId });
    });

    return apiSuccess({ lobbyId: joinedLobbyId });
  } catch (error) {
    if (error instanceof ActiveLobbyConflictError) {
      return apiError("An active lobby already exists", 409, {
        code: "ACTIVE_LOBBY_EXISTS",
      });
    }
    console.error("[lobbies:join] failed", error);
    return apiError("Failed to join lobby", 500);
  }
}
