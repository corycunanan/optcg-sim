import type { NotificationStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolveFriendRequestNotification } from "./notifications";

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
        notification: { updateMany },
      } as unknown as Prisma.TransactionClient;

      await resolveFriendRequestNotification(tx, {
        requestId: "request-1",
        recipientUserId: "user-1",
        status: requestedStatus,
      });

      expect(storedStatus).toBe(initialStatus);
    },
  );
});
