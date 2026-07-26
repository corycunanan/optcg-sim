/**
 * POST   /api/lobbies/[id]/spectators — Join a lobby as a spectator.
 * DELETE /api/lobbies/[id]/spectators — Leave the lobby as a spectator.
 *
 * Body: { confirmDisbandLobbyId?: string }
 */

import { after, NextRequest } from "next/server";
import {
  requireAuth,
  apiAction,
  apiSuccess,
  apiError,
} from "@/lib/api-response";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { JoinSpectatorSchema } from "@/lib/validators/lobbies";
import { apiLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { releaseActiveLobby } from "@/lib/lobbies/active-membership";
import { lockLobbyMembership } from "@/lib/lobbies/membership-lock";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";
import {
  joinLobbyAsSpectator,
  publishSpectatorJoin,
  spectatorJoinFailureMessage,
} from "@/lib/lobbies/join-spectator";

type RouteContext = { params: Promise<{ id: string }> };

class SpectatorMembershipChangedError extends Error {}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-join:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const parsed = await parseBody(request, JoinSpectatorSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { id } = await params;

  try {
    const result = await joinLobbyAsSpectator({
      userId,
      lobbyId: id,
      ...parsed,
    });

    if (result.kind === "confirmation_required") {
      return apiError("Switching parties requires confirmation", 409, {
        code: "PARTY_SWITCH_CONFIRMATION_REQUIRED",
        details: {
          currentLobbyId: result.currentLobbyId,
          targetLobbyId: result.targetLobbyId,
          guestName: result.guestName,
          hasPendingInvite: result.hasPendingInvite,
        },
      });
    }

    if (result.kind !== "joined") {
      const status =
        result.kind === "not_found"
          ? 404
          : result.kind === "spectating_disabled"
            ? 403
            : 409;
      return apiError(spectatorJoinFailureMessage(result.kind), status, {
        ...(result.kind === "active_game_exists"
          ? { code: "ACTIVE_GAME_EXISTS" }
          : result.kind === "active_lobby_exists"
            ? { code: "ACTIVE_LOBBY_EXISTS" }
            : {}),
      });
    }

    after(async () => {
      await publishSpectatorJoin(result, userId);
    });

    const state = await buildLobbyRoomState(id, userId);
    if (!state) {
      return apiError("Party state is unavailable", 409, {
        code: "LOBBY_STATE_CHANGED",
      });
    }

    return apiSuccess(state);
  } catch (error) {
    console.error("[lobbies:spectators:join] failed", error);
    return apiError("Failed to join party as a spectator", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
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
      if (!(await lockLobbyMembership(tx, id))) {
        // Self-leave is uniformly successful after auth/rate limiting. Missing,
        // closed, and absent-membership states must not form an existence oracle.
        return { changed: false };
      }

      const lobby = await tx.lobby.findUnique({
        where: { id },
        select: {
          status: true,
          hostUserId: true,
          guest: { select: { userId: true } },
          spectators: {
            where: { userId },
            select: { userId: true },
          },
        },
      });

      if (!lobby || lobby.status === "CLOSED") {
        return { changed: false };
      }
      if (lobby.hostUserId === userId || lobby.guest?.userId === userId) {
        return { changed: false };
      }

      const spectator = lobby.spectators[0];
      if (!spectator) {
        // The caller is the implicit target, so an already-removed row is a
        // successful no-op and does not churn the lobby revision or fanout.
        return { changed: false };
      }

      // Capture the departing userId before deleting the membership row.
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

      return { changed: true };
    });

    if (!result.changed) return apiAction();

    after(async () => {
      const state = await buildLobbyRoomState(id);
      if (state) await notifyLobby(state, { actorUserId: userId });
    });

    return apiAction();
  } catch (error) {
    if (error instanceof SpectatorMembershipChangedError) {
      return apiError(
        "Spectator membership changed before it could be released",
        409,
        { code: "LOBBY_STATE_CHANGED" }
      );
    }
    console.error("[lobbies:spectators:leave] failed", error);
    return apiError("Failed to leave party as a spectator", 500);
  }
}
