/**
 * POST /api/lobbies/[id]/leave — Release the authenticated PVP guest's
 * pre-game seat and return the room to its joinable waiting state.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";

type RouteContext = { params: Promise<{ id: string }> };

type LeaveFailure =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ALREADY_LEFT"
  | "ALREADY_STARTED"
  | "NOT_PVP";

class GuestSeatChangedError extends Error {}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-leave:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // This conditional status transition is the concurrency lock shared
      // with POST /start. Start and leave cannot both win a READY room.
      const lobbyUpdate = await tx.lobby.updateMany({
        where: {
          id,
          status: "READY",
          mode: "PVP",
          guest: { is: { userId } },
          gameSession: { is: null },
        },
        data: {
          status: "WAITING",
          hostReady: false,
          revision: { increment: 1 },
        },
      });

      if (lobbyUpdate.count !== 1) {
        const lobby = await tx.lobby.findUnique({
          where: { id },
          select: {
            status: true,
            mode: true,
            guest: { select: { userId: true } },
            gameSession: { select: { id: true } },
          },
        });

        let failure: LeaveFailure;
        if (!lobby || lobby.status === "CLOSED") failure = "NOT_FOUND";
        else if (lobby.status === "IN_GAME" || lobby.gameSession)
          failure = "ALREADY_STARTED";
        else if (lobby.mode !== "PVP") failure = "NOT_PVP";
        else if (!lobby.guest) failure = "ALREADY_LEFT";
        else failure = "FORBIDDEN";

        return { failure };
      }

      const removedSeat = await tx.lobbyGuest.deleteMany({
        where: { lobbyId: id, userId },
      });
      if (removedSeat.count !== 1) {
        // Throwing rolls the status transition back if the seat changed
        // unexpectedly between the guarded update and deletion.
        throw new GuestSeatChangedError();
      }

      return { failure: null };
    });

    if (result.failure) return leaveFailureResponse(result.failure);

    after(async () => {
      const state = await buildLobbyRoomState(id);
      if (!state) return;
      // The actor navigates away from the route response; the host needs the
      // fresh WAITING snapshot immediately.
      await notifyLobby(state, { actorUserId: userId });
    });

    return apiAction();
  } catch (error) {
    if (error instanceof GuestSeatChangedError) {
      return apiError("Guest seat changed before it could be released", 409);
    }
    console.error("[lobbies:leave] failed", error);
    return apiError("Failed to leave lobby", 500);
  }
}

function leaveFailureResponse(failure: LeaveFailure) {
  switch (failure) {
    case "NOT_FOUND":
      return apiError("Lobby not found", 404);
    case "FORBIDDEN":
      return apiError("Forbidden", 403);
    case "ALREADY_LEFT":
      return apiError("Guest seat was already released", 404);
    case "ALREADY_STARTED":
      return apiError("Lobby already started", 409, {
        code: "ALREADY_STARTED",
      });
    case "NOT_PVP":
      return apiError("Only a PVP guest can leave this lobby", 409);
  }
}
