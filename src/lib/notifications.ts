import type { NotificationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notificationEventInclude } from "@/lib/realtime/serialize-notification";

export const MAX_NOTIFICATIONS_PER_USER = 100;
const RETENTION_PRUNE_BATCH_SIZE = 25;
const RESOLVED_NOTIFICATION_STATUSES = [
  "ACCEPTED",
  "DECLINED",
] satisfies NotificationStatus[];

type FriendRequestNotificationInput = {
  requestId: string;
  recipientUserId: string;
  actorUserId: string;
};

export async function createFriendRequestNotification(
  tx: Prisma.TransactionClient,
  input: FriendRequestNotificationInput
) {
  const notification = await tx.notification.create({
    data: {
      userId: input.recipientUserId,
      type: "FRIEND_REQUEST",
      actorUserId: input.actorUserId,
      referenceId: input.requestId,
    },
    include: notificationEventInclude,
  });

  const unreadCount = await tx.notification.count({
    where: { userId: input.recipientUserId, status: "PENDING" },
  });

  return { notification, unreadCount };
}

/**
 * Best-effort, bounded retention after the durable notification commits.
 * PENDING, READ, and DISMISSED friend-request notifications may still point at
 * a live request, so only terminal outcomes are eligible for pruning.
 */
export async function pruneResolvedNotifications(userId: string) {
  try {
    const overflow = await prisma.notification.findMany({
      where: {
        userId,
        status: { in: RESOLVED_NOTIFICATION_STATUSES },
      },
      select: { id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: MAX_NOTIFICATIONS_PER_USER,
      take: RETENTION_PRUNE_BATCH_SIZE,
    });

    if (overflow.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          userId,
          status: { in: RESOLVED_NOTIFICATION_STATUSES },
          id: { in: overflow.map(({ id }) => id) },
        },
      });
    }
  } catch (error) {
    console.error("[notifications:retention] failed", error);
  }
}

export async function resolveFriendRequestNotification(
  tx: Prisma.TransactionClient,
  input: {
    requestId: string;
    recipientUserId: string;
    status: Extract<NotificationStatus, "ACCEPTED" | "DECLINED">;
  }
) {
  await tx.notification.updateMany({
    where: {
      userId: input.recipientUserId,
      type: "FRIEND_REQUEST",
      referenceId: input.requestId,
      status: { in: ["PENDING", "READ", "DISMISSED"] },
    },
    data: { status: input.status },
  });

  const [notification, unreadCount] = await Promise.all([
    tx.notification.findFirst({
      where: {
        userId: input.recipientUserId,
        type: "FRIEND_REQUEST",
        referenceId: input.requestId,
      },
      include: notificationEventInclude,
    }),
    tx.notification.count({
      where: { userId: input.recipientUserId, status: "PENDING" },
    }),
  ]);

  return { notification, unreadCount };
}
