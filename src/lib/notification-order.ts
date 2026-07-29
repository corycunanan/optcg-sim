import type { Prisma } from "@prisma/client";

export const NOTIFICATION_INBOX_LIMIT = 20;
export const ACTIONABLE_NOTIFICATION_TYPE = "FRIEND_REQUEST";
export const ACTIONABLE_NOTIFICATION_STATUSES = ["PENDING", "READ"] as const;
export const ACTIONABLE_NOTIFICATION_WHERE = {
  type: ACTIONABLE_NOTIFICATION_TYPE,
  status: { in: [...ACTIONABLE_NOTIFICATION_STATUSES] },
  referenceId: { not: null },
} satisfies Prisma.NotificationWhereInput;

export interface OrderableNotification {
  id: string;
  type: string;
  status: string;
  referenceId: string | null;
  createdAt: string | Date;
}

/**
 * A notification is actionable only while the recipient can still perform
 * its backing action. Add future actionable notification types here.
 */
export function isActionableNotification(
  notification: Pick<OrderableNotification, "type" | "status" | "referenceId">
): boolean {
  return (
    notification.type === ACTIONABLE_NOTIFICATION_TYPE &&
    ACTIONABLE_NOTIFICATION_STATUSES.some(
      (status) => status === notification.status
    ) &&
    notification.referenceId !== null
  );
}

/** Actionable first; newest first with a stable id tie-break within each group. */
export function compareNotifications(
  left: OrderableNotification,
  right: OrderableNotification
): number {
  const actionableDifference =
    Number(isActionableNotification(right)) -
    Number(isActionableNotification(left));
  if (actionableDifference !== 0) return actionableDifference;

  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
    right.id.localeCompare(left.id)
  );
}

export function orderNotifications<T extends OrderableNotification>(
  notifications: readonly T[]
): T[] {
  return [...notifications].sort(compareNotifications);
}

/**
 * Keep the normal inbox window, but never truncate actionable rows. If more
 * than the limit are actionable, the returned inbox intentionally exceeds the
 * limit so every available action remains reachable.
 */
export function limitNotificationInbox<T extends OrderableNotification>(
  notifications: readonly T[],
  limit = NOTIFICATION_INBOX_LIMIT
): T[] {
  const ordered = orderNotifications(notifications);
  const actionableCount = ordered.findIndex(
    (notification) => !isActionableNotification(notification)
  );
  const requiredCount =
    actionableCount === -1 ? ordered.length : actionableCount;

  return ordered.slice(0, Math.max(limit, requiredCount));
}
