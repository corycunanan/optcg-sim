/**
 * DELETE /api/lobbies/[id]/guest — Remove the occupied PVP guest seat.
 * Host only; unavailable once the game has started.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { releaseActiveLobby } from "@/lib/lobbies/active-membership";
import { notifyUser } from "@/lib/realtime/fan-out";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";

type RouteContext = { params: Promise<{ id: string }> };

type KickFailure =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ALREADY_STARTED"
  | "NOT_PVP"
  | "SEAT_CHANGED";

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-kick:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lobby = await tx.lobby.findUnique({
        where: { id },
        select: {
          hostUserId: true,
          status: true,
          mode: true,
          host: { select: { username: true, name: true } },
          guest: { select: { userId: true } },
        },
      });

      if (!lobby) return { failure: "NOT_FOUND" as const };

      const failure = kickFailure(lobby, userId);
      if (failure) return { failure };

      const guestUserId = lobby.guest!.userId;
      const reset = await tx.lobby.updateMany({
        where: {
          id,
          hostUserId: userId,
          status: { in: ["WAITING", "READY"] },
          mode: "PVP",
          guest: { is: { userId: guestUserId } },
        },
        data: {
          status: "WAITING",
          revision: { increment: 1 },
        },
      });

      if (reset.count !== 1) return { failure: "SEAT_CHANGED" as const };

      const removed = await tx.lobbyGuest.deleteMany({
        where: { lobbyId: id, userId: guestUserId },
      });
      if (removed.count !== 1) {
        throw new GuestSeatChangedError();
      }

      await releaseActiveLobby(tx, guestUserId, id);

      return {
        failure: null,
        guestUserId,
        hostName: lobby.host.username ?? lobby.host.name ?? "Host",
      };
    });

    if (result.failure) return kickFailureResponse(result.failure);

    after(async () => {
      const state = await buildLobbyRoomState(id);
      if (!state) return;

      await Promise.all([
        notifyLobby(state),
        notifyUser(result.guestUserId, {
          type: "lobby:guest_removed",
          lobbyId: id,
          hostName: result.hostName,
        }),
      ]);
    });

    return apiAction();
  } catch (error) {
    if (error instanceof GuestSeatChangedError) {
      return kickFailureResponse("SEAT_CHANGED");
    }
    console.error("[lobbies:kick] failed", error);
    return apiError("Failed to kick player", 500);
  }
}

class GuestSeatChangedError extends Error {}

function kickFailure(
  lobby: {
    hostUserId: string;
    status: string;
    mode: string;
    guest: { userId: string } | null;
  },
  userId: string
): KickFailure | null {
  if (lobby.status === "CLOSED") return "NOT_FOUND";
  if (lobby.hostUserId !== userId) return "FORBIDDEN";
  if (lobby.status === "IN_GAME") return "ALREADY_STARTED";
  if (lobby.mode !== "PVP") return "NOT_PVP";
  if (!lobby.guest || lobby.guest.userId === lobby.hostUserId) {
    return "NOT_FOUND";
  }
  return null;
}

function kickFailureResponse(failure: KickFailure) {
  switch (failure) {
    case "NOT_FOUND":
      return apiError("Guest not found", 404);
    case "FORBIDDEN":
      return apiError("Forbidden", 403);
    case "ALREADY_STARTED":
      return apiError("Lobby already started", 409, {
        code: "ALREADY_STARTED",
      });
    case "NOT_PVP":
      return apiError("Only a PVP guest can be kicked", 409);
    case "SEAT_CHANGED":
      return apiError("Guest seat changed before it could be removed", 409, {
        code: "LOBBY_STATE_CHANGED",
      });
  }
}
