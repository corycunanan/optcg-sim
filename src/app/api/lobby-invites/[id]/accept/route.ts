/**
 * POST /api/lobby-invites/[id]/accept — Recipient accepts a lobby invite.
 *
 * Mirrors the join flow in `POST /api/lobbies/join` (creates a `LobbyGuest`
 * row, flips the lobby `WAITING → READY`, fans out `lobby:state_changed` to
 * the host) — by id rather than by code, with the recipient gate.
 *
 * State validation runs **inside** the interactive `$transaction` to prevent
 * TOCTOU: a concurrent start, cancel, or second accept that lands between
 * the initial guards and the writes would otherwise let us create a guest
 * for an already-started lobby or stomp `WAITING → READY` over a fresher
 * status. Conditional `updateMany`s and `create` failures all surface as
 * 409/410 instead of mutating wrong state.
 *
 * Returns `{ lobbyId }` so the caller can `router.push("/lobbies/<id>")`.
 */

import { after, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { cancelPendingLobbyInvites } from "@/lib/lobbies/cancel-invites";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";
import {
  ActiveLobbyConflictError,
  claimActiveLobby,
} from "@/lib/lobbies/active-membership";
import {
  isRetryableTransactionConflict,
  retryTransactionOnce,
} from "@/lib/lobbies/transaction-conflict";

type RouteContext = { params: Promise<{ id: string }> };

type AcceptOutcome =
  | { kind: "ok"; lobbyId: string }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "expired" }
  | { kind: "self" }
  | { kind: "mode" }
  | { kind: "started" }
  | { kind: "occupied" };

class GuestSeatOccupiedError extends Error {}
class InviteNoLongerActiveError extends Error {}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-invite-accept:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id: inviteId } = await params;
  const now = Date.now();

  let result: AcceptOutcome;
  try {
    result = await retryTransactionOnce<AcceptOutcome>(prisma, async (tx) => {
      const invite = await tx.lobbyInvite.findUnique({
        where: { id: inviteId },
        select: {
          id: true,
          lobbyId: true,
          toUserId: true,
          status: true,
          expiresAt: true,
        },
      });
      if (!invite) return { kind: "not_found" };
      if (invite.toUserId !== userId) return { kind: "forbidden" };
      if (invite.status !== "PENDING") return { kind: "gone" };

      const lobby = await tx.lobby.findUnique({
        where: { id: invite.lobbyId },
        select: {
          id: true,
          hostUserId: true,
          mode: true,
          status: true,
          guest: { select: { userId: true } },
        },
      });
      if (!lobby) return { kind: "not_found" };
      if (lobby.hostUserId === userId) return { kind: "self" };
      if (lobby.mode !== "PVP") return { kind: "mode" };
      if (lobby.status !== "WAITING") return { kind: "started" };
      if (lobby.guest && lobby.guest.userId !== lobby.hostUserId) {
        return { kind: "occupied" };
      }

      if (invite.expiresAt.getTime() <= now) {
        // Even expiry transitions take the lobby lock first, matching send
        // and cancel. This prevents the invite→lobby / lobby→invite cycle.
        const lobbyLock = await tx.lobby.updateMany({
          where: { id: lobby.id, status: "WAITING" },
          data: { status: "WAITING" },
        });
        if (lobbyLock.count !== 1) return { kind: "started" };

        const expired = await tx.lobbyInvite.updateMany({
          where: { id: invite.id, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        if (expired.count !== 1) throw new InviteNoLongerActiveError();
        return { kind: "expired" };
      }

      // Lock and transition the lobby before touching the invite. If the
      // later conditional invite flip loses, throwing rolls this write back.
      const lobbyUpdate = await tx.lobby.updateMany({
        where: { id: lobby.id, status: "WAITING" },
        data: { status: "READY", revision: { increment: 1 } },
      });
      if (lobbyUpdate.count !== 1) return { kind: "started" };

      const inviteUpdate = await tx.lobbyInvite.updateMany({
        where: { id: invite.id, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (inviteUpdate.count !== 1) throw new InviteNoLongerActiveError();

      await claimActiveLobby(tx, userId, lobby.id);

      // LobbyGuest.lobbyId is `@unique` — a concurrent join races us here
      // and one side gets P2002. Translate to 409.
      try {
        await tx.lobbyGuest.create({
          data: { lobbyId: lobby.id, userId },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          throw new GuestSeatOccupiedError();
        }
        throw err;
      }

      return { kind: "ok", lobbyId: lobby.id };
    });
  } catch (error) {
    if (error instanceof InviteNoLongerActiveError) {
      return apiError("Invite is no longer active", 410);
    }
    if (isRetryableTransactionConflict(error)) {
      const currentInvite = await prisma.lobbyInvite.findUnique({
        where: { id: inviteId },
        select: { status: true, expiresAt: true },
      });
      if (
        !currentInvite ||
        currentInvite.status !== "PENDING" ||
        currentInvite.expiresAt.getTime() <= now
      ) {
        return apiError("Invite is no longer active", 410);
      }
      return apiError("Invite state changed concurrently. Try again.", 409);
    }
    if (error instanceof ActiveLobbyConflictError) {
      return apiError("An active lobby already exists", 409, {
        code: "ACTIVE_LOBBY_EXISTS",
      });
    }
    if (error instanceof GuestSeatOccupiedError) {
      return apiError("Lobby already has a guest", 409);
    }
    throw error;
  }

  switch (result.kind) {
    case "ok": {
      const acceptedLobbyId = result.lobbyId;
      after(async () => {
        // The seat is now taken; any *other* outstanding invites for this
        // lobby would only fail with 409 if their recipient clicked Join,
        // so cancel them and dismiss their toasts. The accepted invite is
        // already ACCEPTED (not PENDING) so this sweep skips it.
        await cancelPendingLobbyInvites(acceptedLobbyId);

        const state = await buildLobbyRoomState(acceptedLobbyId, userId);
        if (!state) return;
        // Same actor-skip semantics as `POST /api/lobbies/join` — the new
        // guest navigates from this route's response, the host learns from
        // the push.
        await notifyLobby(state, { actorUserId: userId });
      });
      return apiSuccess({ lobbyId: acceptedLobbyId });
    }
    case "not_found":
      return apiError("Invite not found", 404);
    case "forbidden":
      return apiError("Forbidden", 403);
    case "gone":
      return apiError("Invite is no longer active", 410);
    case "expired":
      return apiError("Invite has expired", 410);
    case "self":
      return apiError("You cannot accept an invite to your own lobby", 409);
    case "mode":
      return apiError("Lobby is not in PVP mode", 409);
    case "started":
      return apiError("Lobby is no longer accepting guests", 409);
    case "occupied":
      return apiError("Lobby already has a guest", 409);
  }
}
