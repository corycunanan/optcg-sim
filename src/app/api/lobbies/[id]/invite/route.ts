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
 *   - No PENDING invite already exists for (lobbyId, toUserId).
 *
 * On success: creates the row with `expiresAt = now + 5min`, fans out
 * `lobby:invite_received` via `after()`, returns the serialized invite.
 */

import { after, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { socialLimiter } from "@/lib/rate-limit";
import { SendLobbyInviteSchema } from "@/lib/validators/lobby-invites";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { notifyUser } from "@/lib/realtime/fan-out";
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

  // Atomic dedup. The partial unique index on (lobby_id, to_user_id) WHERE
  // status='PENDING' is the source of truth; the sweep below frees the slot
  // for naturally-expired rows so the recipient-side EXPIRED flip (only
  // fires on accept) doesn't strand future invites. Two concurrent requests
  // for the same (lobby, recipient) race into the create; the loser sees
  // P2002 and returns 409 instead of persisting a duplicate PENDING row.
  let invite: LobbyInviteRow;
  try {
    invite = await prisma.$transaction(async (tx) => {
      await tx.lobbyInvite.updateMany({
        where: {
          lobbyId,
          toUserId,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });
      return tx.lobbyInvite.create({
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
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return apiError("Invite already pending for this user", 409);
    }
    throw err;
  }

  const serialized = serializeLobbyInviteForEvent(invite);

  after(() =>
    notifyUser(toUserId, {
      type: "lobby:invite_received",
      invite: serialized,
    }),
  );

  return apiSuccess(serialized, 201);
}
