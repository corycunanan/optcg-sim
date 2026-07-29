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
    // Keep row IDs and pending-request exclusions inside PostgreSQL. This is
    // one constant-parameter statement even for a large legacy inbox, and the
    // delete predicate repeats the live-request guard at the mutation site.
    await prisma.$executeRaw`
      WITH overflow AS (
        SELECT candidate.id
        FROM notifications AS candidate
        WHERE candidate.user_id = ${userId}
          AND NOT EXISTS (
            SELECT 1
            FROM friend_requests AS live_request
            WHERE candidate.type = 'FRIEND_REQUEST'
              AND live_request.id = candidate.reference_id
              AND live_request."toUserId" = ${userId}
              AND live_request.status = 'PENDING'
          )
        ORDER BY candidate.created_at DESC, candidate.id DESC
        OFFSET ${MAX_NOTIFICATIONS_PER_USER}
      )
      DELETE FROM notifications AS doomed
      USING overflow
      WHERE doomed.id = overflow.id
        AND doomed.user_id = ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM friend_requests AS live_request
          WHERE doomed.type = 'FRIEND_REQUEST'
            AND live_request.id = doomed.reference_id
            AND live_request."toUserId" = ${userId}
            AND live_request.status = 'PENDING'
        )
    `;
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
