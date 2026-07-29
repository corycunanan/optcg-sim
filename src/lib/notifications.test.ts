import type { NotificationStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      mocks.executeRaw(strings, ...values),
  },
}));

const { pruneNotifications, resolveFriendRequestNotification } =
  await import("./notifications");

beforeEach(() => {
  mocks.executeRaw.mockReset();
  mocks.executeRaw.mockResolvedValue(0);
});

describe("pruneNotifications", () => {
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
