/**
 * GET  /api/friends/requests — List pending incoming/outgoing requests
 * POST /api/friends/requests — Send a friend request
 */

import { after, NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { SendFriendRequestSchema } from "@/lib/validators/friends";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  createFriendRequestNotification,
  pruneNotifications,
} from "@/lib/notifications";
import { notifyUser } from "@/lib/realtime/fan-out";
import { serializeFriendRequestForEvent } from "@/lib/realtime/serialize-friend";
import { serializeNotificationForEvent } from "@/lib/realtime/serialize-notification";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  try {
    const [incoming, outgoing] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { toUserId: userId, status: "PENDING" },
        include: {
          fromUser: { select: { id: true, username: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.friendRequest.findMany({
        where: { fromUserId: userId, status: "PENDING" },
        include: {
          toUser: { select: { id: true, username: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return apiSuccess({ incoming, outgoing }, 200, { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" });
  } catch (error) {
    console.error("[friends:list-requests] failed", error);
    return apiError("Failed to list requests", 500);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await socialLimiter.check(`friend-req:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, SendFriendRequestSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { toUserId } = parsed;
    if (toUserId === userId) {
      return apiError("Cannot send request to yourself", 400);
    }

    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) {
      return apiError("User not found", 404);
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: toUserId },
          { userAId: toUserId, userBId: userId },
        ],
      },
    });
    if (friendship) {
      return apiError("Already friends", 409);
    }

    const existing = await prisma.friendRequest.findFirst({
      where: {
        status: "PENDING",
        OR: [
          { fromUserId: userId, toUserId },
          { fromUserId: toUserId, toUserId: userId },
        ],
      },
    });
    if (existing) {
      return apiError("Request already pending", 409);
    }

    const { req, notification, unreadCount } = await prisma.$transaction(async (tx) => {
      const createdRequest = await tx.friendRequest.create({
        data: { fromUserId: userId, toUserId },
        include: {
          fromUser: { select: { id: true, username: true, name: true, image: true } },
          toUser: { select: { id: true, username: true, name: true, image: true } },
        },
      });

      const notificationResult = await createFriendRequestNotification(tx, {
        requestId: createdRequest.id,
        recipientUserId: toUserId,
        actorUserId: userId,
      });

      return {
        req: createdRequest,
        ...notificationResult,
      };
    });

    // Retention is deliberately best-effort and post-commit: pruning must
    // never lengthen or roll back an otherwise valid friend request.
    after(() => pruneNotifications(toUserId));

    after(() =>
      notifyUser(toUserId, {
        type: "notification:created",
        notification: serializeNotificationForEvent(notification),
        unreadCount,
      }),
    );

    after(() =>
      notifyUser(toUserId, {
        type: "friend:request_received",
        request: serializeFriendRequestForEvent(req),
      }),
    );

    return apiSuccess(req, 201);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // The partial unique index on the unordered user pair is the source of
      // truth here. A reciprocal request may have won the race after the
      // friendly pre-check above, so do not fan out a request that was not
      // persisted.
      return apiError("Request already pending", 409);
    }
    console.error("[friends:create-request] failed", error);
    return apiError("Failed to send request", 500);
  }
}
