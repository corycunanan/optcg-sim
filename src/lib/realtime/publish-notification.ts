import { prisma } from "@/lib/db";
import { notifyUser } from "@/lib/realtime/fan-out";
import {
  notificationEventInclude,
  serializeNotificationForEvent,
} from "@/lib/realtime/serialize-notification";

/**
 * Post-commit publisher for single-row read/dismiss changes. Database reads
 * and realtime delivery are best-effort so they cannot fail the mutation.
 */
export async function publishNotificationUpdated(
  userId: string,
  notificationId: string
): Promise<void> {
  try {
    const [notification, unreadCount] = await Promise.all([
      prisma.notification.findFirst({
        where: { id: notificationId, userId },
        include: notificationEventInclude,
      }),
      prisma.notification.count({
        where: { userId, status: "PENDING" },
      }),
    ]);
    if (!notification) return;

    await notifyUser(userId, {
      type: "notification:updated",
      notification: serializeNotificationForEvent(notification),
      unreadCount,
    });
  } catch (error) {
    console.warn("[notifications:realtime-update] failed", error);
  }
}

/** Post-commit publisher for bulk mark-all-read badge/list convergence. */
export async function publishNotificationsReadAll(
  userId: string
): Promise<void> {
  try {
    const unreadCount = await prisma.notification.count({
      where: { userId, status: "PENDING" },
    });
    await notifyUser(userId, {
      type: "notification:read_all",
      unreadCount,
    });
  } catch (error) {
    console.warn("[notifications:realtime-read-all] failed", error);
  }
}
