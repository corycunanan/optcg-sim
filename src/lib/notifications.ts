import type { NotificationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notificationEventInclude } from "@/lib/realtime/serialize-notification";

export const MAX_NOTIFICATIONS_PER_USER = 100;

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
 * Best-effort retention after the triggering mutation commits.
 *
 * The inbox retains the newest MAX_NOTIFICATIONS_PER_USER rows that are not
 * backed by a live friend request. Live request notifications are exempt
 * regardless of notification status, so reading or dismissing one cannot
 * orphan the still-actionable request.
 */
export async function pruneNotifications(userId: string) {
  try {
    const liveRequests = await prisma.friendRequest.findMany({
      where: { toUserId: userId, status: "PENDING" },
      select: { id: true },
    });
    const liveRequestIds = liveRequests.map(({ id }) => id);
    const isNotLive: Prisma.NotificationWhereInput[] = [
      { type: { not: "FRIEND_REQUEST" } },
      { referenceId: null },
      { referenceId: { notIn: liveRequestIds } },
    ];

    const overflow = await prisma.notification.findMany({
      where: {
        userId,
        OR: isNotLive,
      },
      select: { id: true, type: true, referenceId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: MAX_NOTIFICATIONS_PER_USER,
    });

    if (overflow.length > 0) {
      // Re-check candidate references immediately before deletion. Request
      // creation and notification creation commit atomically, and request IDs
      // are immutable, so a row absent from this second live set cannot become
      // actionable after this point through an application path.
      const candidateRequestIds = overflow.flatMap((notification) =>
        notification.type === "FRIEND_REQUEST" && notification.referenceId
          ? [notification.referenceId]
          : []
      );
      const stillLiveRequests =
        candidateRequestIds.length === 0
          ? []
          : await prisma.friendRequest.findMany({
              where: {
                id: { in: candidateRequestIds },
                toUserId: userId,
                status: "PENDING",
              },
              select: { id: true },
            });
      const stillLiveRequestIds = new Set(
        stillLiveRequests.map(({ id }) => id)
      );
      const prunableIds = overflow.flatMap((notification) =>
        notification.type === "FRIEND_REQUEST" &&
        notification.referenceId &&
        stillLiveRequestIds.has(notification.referenceId)
          ? []
          : [notification.id]
      );

      if (prunableIds.length === 0) return;

      await prisma.notification.deleteMany({
        where: {
          userId,
          id: { in: prunableIds },
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
