import type { NotificationStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredNotification = {
  id: string;
  userId: string;
  status: NotificationStatus;
  referenceId: string | null;
  createdAt: Date;
};

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRaw: (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => mocks.executeRaw(strings, ...values),
  },
}));

const {
  MAX_NOTIFICATIONS_PER_USER,
  pruneNotifications,
  resolveFriendRequestNotification,
} = await import("./notifications");

let notifications: StoredNotification[];
let liveRequestIds: Set<string>;
let executedSql: string;
let executedValues: unknown[];

function notification(index: number, status: NotificationStatus) {
  return {
    id: `notification-${index.toString().padStart(6, "0")}`,
    userId: "user-1",
    status,
    referenceId: `request-${index.toString().padStart(6, "0")}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
  };
}

beforeEach(() => {
  notifications = [];
  liveRequestIds = new Set();
  executedSql = "";
  executedValues = [];
  mocks.executeRaw.mockReset();
  mocks.executeRaw.mockImplementation(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executedSql = strings.join("?");
      executedValues = values;
      const userId = values.find((value) => typeof value === "string") as string;
      const retentionLimit = values.find(
        (value) => typeof value === "number"
      ) as number;
      const eligible = notifications
        .filter(
          (row) =>
            row.userId === userId &&
            (!row.referenceId || !liveRequestIds.has(row.referenceId))
        )
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() ||
            right.id.localeCompare(left.id)
        );
      const overflowIds = new Set(
        eligible.slice(retentionLimit).map(({ id }) => id)
      );
      const before = notifications.length;
      notifications = notifications.filter(
        (row) =>
          row.userId !== userId ||
          !overflowIds.has(row.id) ||
          (row.referenceId !== null && liveRequestIds.has(row.referenceId))
      );
      return before - notifications.length;
    }
  );
});

describe("pruneNotifications", () => {
  it("bounds a large non-live backlog with constant application parameters", async () => {
    const statuses: NotificationStatus[] = [
      "PENDING",
      "READ",
      "DISMISSED",
      "ACCEPTED",
      "DECLINED",
    ];
    notifications = Array.from({ length: 100_100 }, (_, index) =>
      notification(index, statuses[index % statuses.length])
    );

    await pruneNotifications("user-1");

    expect(notifications).toHaveLength(MAX_NOTIFICATIONS_PER_USER);
    expect(notifications.some((row) => row.status === "PENDING")).toBe(true);
    expect(executedValues).toEqual([
      "user-1",
      "user-1",
      MAX_NOTIFICATIONS_PER_USER,
      "user-1",
      "user-1",
    ]);
    expect(executedValues.every((value) => !Array.isArray(value))).toBe(true);
    expect(executedSql).not.toMatch(/\bIN\s*\(/);
  });

  it("guards live request notifications in selection and deletion", async () => {
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
    expect(executedSql.match(/NOT EXISTS/g)).toHaveLength(2);
    expect(executedSql.match(/live_request\.status = 'PENDING'/g)).toHaveLength(
      2
    );
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
    mocks.executeRaw.mockRejectedValueOnce(new Error("retention unavailable"));

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
