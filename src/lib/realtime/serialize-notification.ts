import type {
  SerializedJsonValue,
  SerializedNotification,
  SerializedUser,
} from "@/types/realtime";

/** Database shape selected for notification list responses and realtime events. */
export interface NotificationRow {
  id: string;
  userId: string;
  type: "FRIEND_REQUEST";
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "READ" | "DISMISSED";
  actorUserId: string | null;
  referenceId: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
  actor: SerializedUser | null;
}

export const notificationEventInclude = {
  actor: {
    select: { id: true, username: true, name: true, image: true },
  },
} as const;

/** Convert Prisma dates and relation data into the UserChannel wire shape. */
export function serializeNotificationForEvent(
  notification: NotificationRow
): SerializedNotification {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    status: notification.status,
    actorUserId: notification.actorUserId,
    referenceId: notification.referenceId,
    // Prisma guarantees JsonValue here; the serializer is the boundary that
    // narrows the database representation to the transport representation.
    payload: notification.payload as SerializedJsonValue,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
    actor: notification.actor
      ? {
          id: notification.actor.id,
          username: notification.actor.username,
          name: notification.actor.name,
          image: notification.actor.image,
        }
      : null,
  };
}
