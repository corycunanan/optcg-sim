/**
 * PUT /api/friends/requests/[id] — Accept or decline a friend request
 */

import { after, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { FriendRequestActionSchema } from "@/lib/validators/friends";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { resolveFriendRequestNotification } from "@/lib/notifications";
import { notifyUser } from "@/lib/realtime/fan-out";
import {
  serializeFriendRequestForEvent,
  serializeFriendshipForEvent,
} from "@/lib/realtime/serialize-friend";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { session, userId } = authResult;

  const { limited } = await socialLimiter.check(`friend-action:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const parsed = await parseBody(request, FriendRequestActionSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { action } = parsed;

    const req = await prisma.friendRequest.findFirst({
      where: { id, toUserId: userId, status: "PENDING" },
      include: {
        fromUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    if (!req) {
      return apiError("Request not found", 404);
    }

    if (action === "accept") {
      // Create friendship with userA < userB lexicographically
      const [userAId, userBId] = [req.fromUserId, userId].sort();

      let result;
      try {
        result = await prisma.$transaction(async (tx) => {
          // A decline can win after the read above. Remove this exact pending
          // request first so a stale accept cannot create a friendship after
          // the request is gone.
          const removedRequest = await tx.friendRequest.deleteMany({
            where: { id, toUserId: userId, status: "PENDING" },
          });
          if (removedRequest.count !== 1) return { kind: "missing" as const };

          const createdFriendship = await tx.friendship.create({
            data: { userAId, userBId },
          });

          // Delete every pending row for this unordered pair. The migration
          // prevents new reciprocal rows, while this also clears any legacy
          // rows that may remain during a racing acceptance.
          await tx.friendRequest.deleteMany({
            where: {
              status: "PENDING",
              OR: [
                { fromUserId: userAId, toUserId: userBId },
                { fromUserId: userBId, toUserId: userAId },
              ],
            },
          });

          await resolveFriendRequestNotification(tx, {
            requestId: id,
            recipientUserId: userId,
            status: "ACCEPTED",
          });

          return { kind: "accepted" as const, friendship: createdFriendship };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Another acceptance already created the canonical friendship. The
          // caller still gets a successful, idempotent response; only the
          // winning transaction may emit the acceptance event.
          await prisma.$transaction(async (tx) => {
            await tx.friendRequest.deleteMany({
              where: {
                status: "PENDING",
                OR: [
                  { fromUserId: userAId, toUserId: userBId },
                  { fromUserId: userBId, toUserId: userAId },
                ],
              },
            });
            await resolveFriendRequestNotification(tx, {
              requestId: id,
              recipientUserId: userId,
              status: "ACCEPTED",
            });
          });
          return apiAction();
        }
        throw error;
      }

      if (result.kind === "missing") {
        return apiError("Request not found", 404);
      }
      const { friendship } = result;

      // The accepter's user info, sent to the original sender so their
      // sidebar can append the new friend without a refetch.
      const accepter = {
        id: userId,
        username: session.user.username ?? null,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      };

      after(() =>
        notifyUser(req.fromUserId, {
          type: "friend:request_accepted",
          request: serializeFriendRequestForEvent(req),
          friendship: serializeFriendshipForEvent(friendship, accepter),
        }),
      );

      return apiAction();
    } else {
      // Decline — delete the request and resolve its notification atomically.
      const result = await prisma.$transaction(async (tx) => {
        const removedRequest = await tx.friendRequest.deleteMany({
          where: { id, toUserId: userId, status: "PENDING" },
        });
        if (removedRequest.count !== 1) return { kind: "missing" as const };

        await resolveFriendRequestNotification(tx, {
          requestId: id,
          recipientUserId: userId,
          status: "DECLINED",
        });
        return { kind: "declined" as const };
      });
      if (result.kind === "missing") {
        return apiError("Request not found", 404);
      }

      after(() =>
        notifyUser(req.fromUserId, {
          type: "friend:request_declined",
          requestId: id,
          // Sender's `pendingSent` Set is keyed by user id, not request id —
          // include the decliner so the "Sent" badge can clear in realtime.
          toUserId: req.toUserId,
        }),
      );

      return apiAction();
    }
  } catch (error) {
    console.error("[friends:resolve-request] failed", error);
    return apiError("Failed to process request", 500);
  }
}
