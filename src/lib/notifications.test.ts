import type { NotificationStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredNotification = {
  id: string;
  userId: string;
  type: "FRIEND_REQUEST";
  status: NotificationStatus;
  referenceId: string | null;
  createdAt: Date;
};

const mocks = vi.hoisted(() => ({
  friendRequestFindMany: vi.fn(),
  notificationFindMany: vi.fn(),
  notificationDeleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    friendRequest: { findMany: mocks.friendRequestFindMany },
    notification: {
      findMany: mocks.notificationFindMany,
      deleteMany: mocks.notificationDeleteMany,
    },
  },
}));

const {
  MAX_NOTIFICATIONS_PER_USER,
  pruneNotifications,
  resolveFriendRequestNotification,
} = await import("./notifications");

let notifications: StoredNotification[];
let liveRequestIds: Set<string>;

function notification(index: number, status: NotificationStatus) {
  return {
    id: `notification-${index.toString().padStart(3, "0")}`,
    userId: "user-1",
    type: "FRIEND_REQUEST" as const,
    status,
    referenceId: `request-${index.toString().padStart(3, "0")}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
  };
}

beforeEach(() => {
  notifications = [];
  liveRequestIds = new Set();
  mocks.friendRequestFindMany.mockReset();
  mocks.notificationFindMany.mockReset();
  mocks.notificationDeleteMany.mockReset();

  mocks.friendRequestFindMany.mockImplementation(async ({ where }) => {
    const ids = where.id?.in as string[] | undefined;
    return [...liveRequestIds]
      .filter((id) => !ids || ids.includes(id))
      .map((id) => ({ id }));
  });
  mocks.notificationFindMany.mockImplementation(async ({ where, skip }) => {
    const excludedLiveIds = new Set(
      (where.OR[2].referenceId.notIn ?? []) as string[]
    );
    return notifications
      .filter(
        (row) =>
          row.userId === where.userId &&
          (row.referenceId === null || !excludedLiveIds.has(row.referenceId))
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id)
      )
      .slice(skip)
      .map(({ id, type, referenceId }) => ({ id, type, referenceId }));
  });
  mocks.notificationDeleteMany.mockImplementation(async ({ where }) => {
    const ids = new Set(where.id.in as string[]);
    const before = notifications.length;
    notifications = notifications.filter(
      (row) => row.userId !== where.userId || !ids.has(row.id)
    );
    return { count: before - notifications.length };
  });
});

describe("pruneNotifications", () => {
  it("bounds non-live rows without another friend request arriving", async () => {
    const statuses: NotificationStatus[] = [
      "PENDING",
      "READ",
      "DISMISSED",
      "ACCEPTED",
      "DECLINED",
    ];
    notifications = Array.from({ length: 140 }, (_, index) =>
      notification(index, statuses[index % statuses.length])
    );

    await pruneNotifications("user-1");

    expect(notifications).toHaveLength(MAX_NOTIFICATIONS_PER_USER);
    expect(notifications.some((row) => row.status === "PENDING")).toBe(true);
    expect(mocks.notificationDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("never prunes a live request notification even far over the cap", async () => {
    notifications = Array.from({ length: 235 }, (_, index) =>
      notification(index, index % 2 === 0 ? "READ" : "DISMISSED")
    );
    liveRequestIds = new Set(
      notifications.slice(110).map((row) => row.referenceId!)
    );

    await pruneNotifications("user-1");

    const retainedIds = new Set(
      notifications.map(({ referenceId }) => referenceId)
    );
    expect(
      [...liveRequestIds].every((requestId) => retainedIds.has(requestId))
    ).toBe(true);
    expect(notifications).toHaveLength(125 + MAX_NOTIFICATIONS_PER_USER);
    expect(
      notifications.filter((row) => !liveRequestIds.has(row.referenceId!))
    ).toHaveLength(MAX_NOTIFICATIONS_PER_USER);
  });

  it("re-checks live requests before deleting an overflow candidate", async () => {
    notifications = Array.from({ length: 101 }, (_, index) =>
      notification(index, "DISMISSED")
    );
    mocks.friendRequestFindMany
      .mockResolvedValueOnce([])
      .mockImplementationOnce(async ({ where }) => {
        const requestId = where.id.in[0] as string;
        liveRequestIds.add(requestId);
        return [{ id: requestId }];
      });

    await pruneNotifications("user-1");

    expect(notifications).toHaveLength(101);
    expect(mocks.notificationDeleteMany).not.toHaveBeenCalled();
  });

  it("is idempotent when pruning invocations overlap", async () => {
    notifications = Array.from({ length: 130 }, (_, index) =>
      notification(index, "ACCEPTED")
    );

    await Promise.all([
      pruneNotifications("user-1"),
      pruneNotifications("user-1"),
    ]);

    expect(notifications).toHaveLength(MAX_NOTIFICATIONS_PER_USER);
  });

  it("absorbs retention failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.friendRequestFindMany.mockRejectedValueOnce(
      new Error("retention unavailable")
    );

    await expect(pruneNotifications("user-1")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[notifications:retention] failed",
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });
});

describe("resolveFriendRequestNotification", () => {
  it.each([
    ["ACCEPTED", "DECLINED"],
    ["DECLINED", "ACCEPTED"],
  ] as const)(
    "does not overwrite terminal status %s with %s",
    async (initialStatus, requestedStatus) => {
      let storedStatus: NotificationStatus = initialStatus;
      const updateMany = vi.fn(async ({ where, data }) => {
        const statusFilter = where.status as
          | { in: NotificationStatus[] }
          | undefined;
        if (!statusFilter || statusFilter.in.includes(storedStatus)) {
          storedStatus = data.status;
          return { count: 1 };
        }
        return { count: 0 };
      });
      const tx = {
        notification: {
          updateMany,
          findFirst: vi.fn().mockResolvedValue({
            id: "notification-1",
            status: initialStatus,
          }),
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as Prisma.TransactionClient;

      await resolveFriendRequestNotification(tx, {
        requestId: "request-1",
        recipientUserId: "user-1",
        status: requestedStatus,
      });

      expect(storedStatus).toBe(initialStatus);
    }
  );
});
