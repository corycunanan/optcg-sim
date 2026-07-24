/**
 * POST /api/lobbies/[id]/invite — Host invites a friend to this lobby.
 *
 * Body: { toUserId: string }
 *
 * Guards (in order):
 *   - Caller is signed in.
 *   - Caller is the host of the lobby.
 *   - Lobby is in PVP mode and not closed/in-game.
 *   - No real guest is already seated (host-shares-with-self in solitaire is
 *     covered by `lobby.guest && guest.userId !== lobby.hostUserId` being false).
 *   - Recipient is a friend (deliberate scope cut: no random invites).
 *   - Any prior PENDING invite is voided before the new one is created.
 *
 * On success: creates the row with `expiresAt = now + 5min`, bumps the room
 * revision, and fans out both the new room state and directed invite events.
 */

import { after, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import {
  requireAuth,
  apiAction,
  apiSuccess,
  apiError,
} from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { socialLimiter } from "@/lib/rate-limit";
import { SendLobbyInviteSchema } from "@/lib/validators/lobby-invites";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { notifyUser } from "@/lib/realtime/fan-out";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import {
  isRetryableTransactionConflict,
  retryTransactionOnce,
} from "@/lib/lobbies/transaction-conflict";
import {
  serializeLobbyInviteForEvent,
  type LobbyInviteRow,
} from "@/lib/realtime/serialize-lobby-invite";

const INVITE_TTL_MS = 5 * 60 * 1000;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await socialLimiter.check(`lobby-invite:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id: lobbyId } = await params;
  const parsed = await parseBody(request, SendLobbyInviteSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { toUserId } = parsed;

  if (toUserId === userId) {
    return apiError("Cannot invite yourself", 400);
  }

  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      hostUserId: true,
      status: true,
      mode: true,
      joinCode: true,
      format: true,
      guest: { select: { userId: true } },
    },
  });

  if (!lobby) {
    return apiError("Lobby not found", 404);
  }

  if (lobby.hostUserId !== userId) {
    return apiError("Only the host can invite friends", 403);
  }

  if (lobby.status !== "WAITING" && lobby.status !== "READY") {
    return apiError("Lobby is closed or already started", 400);
  }

  if (lobby.mode !== "PVP") {
    return apiError("Invites are only available in PVP lobbies", 400);
  }

  if (lobby.guest && lobby.guest.userId !== lobby.hostUserId) {
    return apiError("Lobby already has a guest", 409);
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: userId, userBId: toUserId },
        { userAId: toUserId, userBId: userId },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    return apiError("You can only invite friends", 400);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

  // The lobby-row update serializes senders, then this transaction expires
  // stale rows, cancels the prior live invite, and creates its replacement.
  // The partial unique index remains a final guard against unexpected races.
  let transactionResult:
    | {
        kind: "created";
        invite: LobbyInviteRow;
        replaced: Array<{ id: string; toUserId: string }>;
      }
    | { kind: "unavailable" };
  try {
    transactionResult = await retryTransactionOnce(prisma, async (tx) => {
      // Revalidate the active lobby snapshot inside the same transaction as
      // invite creation. If close commits CLOSED after the preflight read,
      // this conditional update returns 0 and no invite can be created.
      const activeLobby = await tx.lobby.updateMany({
        where: {
          id: lobbyId,
          hostUserId: userId,
          status: lobby.status,
          mode: "PVP",
          guest: { is: null },
        },
        data: {
          status: lobby.status,
          revision: { increment: 1 },
        },
      });
      if (activeLobby.count !== 1) return { kind: "unavailable" as const };

      // Expired rows are void before this request. Mark them explicitly so
      // the partial PENDING index cannot strand a later re-invite.
      await tx.lobbyInvite.updateMany({
        where: {
          lobbyId,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });

      // The lobby-row update above serializes concurrent invite requests.
      // Once this transaction holds that row lock, replace every still-live
      // invite so the single-guest room has exactly one outstanding offer.
      const replaced = await tx.lobbyInvite.findMany({
        where: {
          lobbyId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
        select: { id: true, toUserId: true },
      });
      if (replaced.length > 0) {
        await tx.lobbyInvite.updateMany({
          where: {
            id: { in: replaced.map((invite) => invite.id) },
            status: "PENDING",
          },
          data: { status: "CANCELED" },
        });
      }

      const invite = await tx.lobbyInvite.create({
        data: {
          lobbyId,
          fromUserId: userId,
          toUserId,
          expiresAt,
        },
        include: {
          fromUser: {
            select: { id: true, username: true, name: true, image: true },
          },
          lobby: {
            select: {
              joinCode: true,
              format: true,
              mode: true,
              host: { select: { username: true } },
            },
          },
        },
      });
      return { kind: "created" as const, invite, replaced };
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return apiError("Invite already pending for this user", 409);
    }
    if (isRetryableTransactionConflict(err)) {
      return apiError("Invite state changed concurrently. Try again.", 409);
    }
    throw err;
  }

  if (transactionResult.kind === "unavailable") {
    return apiError("Lobby is closed or already started", 400);
  }

  const serialized = serializeLobbyInviteForEvent(transactionResult.invite);

  after(async () => {
    await Promise.all([
      ...transactionResult.replaced.map((invite) =>
        notifyUser(invite.toUserId, {
          type: "lobby:invite_canceled" as const,
          inviteId: invite.id,
        })
      ),
      notifyUser(toUserId, {
        type: "lobby:invite_received",
        invite: serialized,
      }),
    ]);

    const state = await buildLobbyRoomState(lobbyId, userId);
    if (state) {
      await notifyUser(userId, { type: "lobby:state_changed", lobby: state });
    }
  });

  return apiSuccess(serialized, 201);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await socialLimiter.check(
    `lobby-invite-cancel:${userId}`
  );
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id: lobbyId } = await params;
  const now = new Date();
  let result:
    | { kind: "not_found" }
    | { kind: "forbidden" }
    | { kind: "unavailable" }
    | { kind: "gone" }
    | {
        kind: "canceled";
        invites: Array<{ id: string; toUserId: string }>;
      };
  try {
    result = await retryTransactionOnce(prisma, async (tx) => {
      const lobby = await tx.lobby.findUnique({
        where: { id: lobbyId },
        select: { hostUserId: true, status: true },
      });
      if (!lobby) return { kind: "not_found" as const };
      if (lobby.hostUserId !== userId) {
        return { kind: "forbidden" as const };
      }
      if (lobby.status !== "WAITING" && lobby.status !== "READY") {
        return { kind: "unavailable" as const };
      }

      // Lock the room using the same order as invite creation so a concurrent
      // replacement cannot appear between the pending read and cancellation.
      const activeLobby = await tx.lobby.updateMany({
        where: {
          id: lobbyId,
          hostUserId: userId,
          status: lobby.status,
        },
        data: { status: lobby.status },
      });
      if (activeLobby.count !== 1) {
        return { kind: "unavailable" as const };
      }

      await tx.lobbyInvite.updateMany({
        where: {
          lobbyId,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });

      const pending = await tx.lobbyInvite.findMany({
        where: {
          lobbyId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
        select: { id: true, toUserId: true },
      });
      if (pending.length === 0) return { kind: "gone" as const };

      await tx.lobbyInvite.updateMany({
        where: {
          id: { in: pending.map((invite) => invite.id) },
          status: "PENDING",
        },
        data: { status: "CANCELED" },
      });
      await tx.lobby.update({
        where: { id: lobbyId },
        data: { revision: { increment: 1 } },
      });

      return { kind: "canceled" as const, invites: pending };
    });
  } catch (error) {
    if (isRetryableTransactionConflict(error)) {
      return apiError("Invite state changed concurrently. Try again.", 409);
    }
    throw error;
  }

  switch (result.kind) {
    case "not_found":
      return apiError("Lobby not found", 404);
    case "forbidden":
      return apiError("Only the host can cancel invites", 403);
    case "unavailable":
      return apiError("Lobby is closed or already started", 409);
    case "gone":
      return apiError("Invite is no longer active", 410);
    case "canceled":
      after(async () => {
        await Promise.all(
          result.invites.map((invite) =>
            notifyUser(invite.toUserId, {
              type: "lobby:invite_canceled",
              inviteId: invite.id,
            })
          )
        );

        const state = await buildLobbyRoomState(lobbyId, userId);
        if (state) {
          await notifyUser(userId, {
            type: "lobby:state_changed",
            lobby: state,
          });
        }
      });
      return apiAction();
  }
}
