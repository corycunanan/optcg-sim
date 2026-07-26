/**
 * DELETE /api/lobbies/[id]/spectators/[userId] — Remove one spectator.
 * Host only. Repeating a successful removal is an idempotent no-op.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { releaseActiveLobby } from "@/lib/lobbies/active-membership";
import { lockLobbyMembership } from "@/lib/lobbies/membership-lock";
import {
  notifyLobby,
  notifySpectatorsRemoved,
} from "@/lib/realtime/fanout-lobby";
import { revokeSpectatorSocketsForLobby } from "@/lib/realtime/revoke-spectators";

type RouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

type RemoveFailure = "NOT_FOUND" | "FORBIDDEN";

class SpectatorMembershipChangedError extends Error {}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId: actorUserId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-kick:${actorUserId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id, userId: targetUserId } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!(await lockLobbyMembership(tx, id))) {
        return { failure: "NOT_FOUND" as const, changed: false as const };
      }

      const lobby = await tx.lobby.findUnique({
        where: { id },
        select: {
          status: true,
          hostUserId: true,
          guest: { select: { userId: true } },
          spectators: {
            select: { userId: true },
            orderBy: { userId: "asc" },
          },
        },
      });

      if (!lobby || lobby.status === "CLOSED") {
        return { failure: "NOT_FOUND" as const, changed: false as const };
      }
      if (lobby.hostUserId !== actorUserId) {
        const callerIsMember =
          lobby.guest?.userId === actorUserId ||
          lobby.spectators.some(({ userId }) => userId === actorUserId);
        return {
          failure: callerIsMember
            ? ("FORBIDDEN" as const)
            : ("NOT_FOUND" as const),
          changed: false as const,
        };
      }

      const spectator = lobby.spectators.find(
        ({ userId }) => userId === targetUserId
      );
      if (!spectator) {
        return { failure: null, changed: false as const };
      }

      // Capture the directed-event audience before the delete makes this user
      // unreachable through the rebuilt lobby state.
      const removedSpectatorUserId = spectator.userId;
      const removed = await tx.lobbySpectator.deleteMany({
        where: { lobbyId: id, userId: removedSpectatorUserId },
      });
      if (removed.count !== 1) {
        throw new SpectatorMembershipChangedError();
      }

      await releaseActiveLobby(tx, removedSpectatorUserId, id);
      await tx.lobby.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });

      return {
        failure: null,
        changed: true as const,
        removedSpectatorUserId,
      };
    });

    if (result.failure) return removeFailureResponse(result.failure);
    if (!result.changed) return apiAction();

    after(async () => {
      const directedEjection = notifySpectatorsRemoved({
        lobbyId: id,
        reason: "REMOVED_BY_HOST",
        removedSpectatorUserIds: [result.removedSpectatorUserId],
      });
      const socketRevocation = revokeSpectatorSocketsForLobby(id, [
        result.removedSpectatorUserId,
      ]);
      const stateFanout = buildLobbyRoomState(id).then((state) =>
        state ? notifyLobby(state) : undefined
      );

      // A rebuild failure must not suppress the directed terminal event.
      await Promise.allSettled([
        directedEjection,
        socketRevocation,
        stateFanout,
      ]);
    });

    return apiAction();
  } catch (error) {
    if (error instanceof SpectatorMembershipChangedError) {
      return apiError(
        "Spectator membership changed before it could be removed",
        409,
        {
          code: "LOBBY_STATE_CHANGED",
        }
      );
    }
    console.error("[lobbies:spectators:remove] failed", error);
    return apiError("Failed to remove spectator", 500);
  }
}

function removeFailureResponse(failure: RemoveFailure) {
  switch (failure) {
    case "NOT_FOUND":
      return apiError("Lobby not found", 404);
    case "FORBIDDEN":
      return apiError("Forbidden", 403);
  }
}
