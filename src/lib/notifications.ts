import type {
  NotificationStatus,
  Prisma,
} from "@prisma/client";

export const MAX_NOTIFICATIONS_PER_USER = 100;

type FriendRequestNotificationInput = {
  requestId: string;
  recipientUserId: string;
  actorUserId: string;
};

export async function createFriendRequestNotification(
  tx: Prisma.TransactionClient,
  input: FriendRequestNotificationInput,
) {
  await tx.notification.create({
    data: {
      userId: input.recipientUserId,
      type: "FRIEND_REQUEST",
      actorUserId: input.actorUserId,
      referenceId: input.requestId,
    },
  });

  const overflow = await tx.notification.findMany({
    where: { userId: input.recipientUserId },
    select: { id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_NOTIFICATIONS_PER_USER,
  });

  if (overflow.length > 0) {
    await tx.notification.deleteMany({
      where: { id: { in: overflow.map(({ id }) => id) } },
    });
  }
}

export async function resolveFriendRequestNotification(
  tx: Prisma.TransactionClient,
  input: {
    requestId: string;
    recipientUserId: string;
    status: Extract<NotificationStatus, "ACCEPTED" | "DECLINED">;
  },
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
}
