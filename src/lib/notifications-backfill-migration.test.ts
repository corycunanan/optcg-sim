import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createTestPrisma,
  describeWithDatabase,
} from "@/test/database/harness";

const migration = readFileSync(
  new URL(
    "../../prisma/migrations/20260728233000_backfill_pending_friend_request_notifications/migration.sql",
    import.meta.url
  ),
  "utf8"
);

describeWithDatabase(
  "pending friend-request notification backfill migration",
  () => {
    let prisma: PrismaClient;

    const notificationCreated = new Date("2026-07-24T14:00:00.000Z");
    const notificationUpdated = new Date("2026-07-25T15:00:00.000Z");
    const pendingRequests = Array.from({ length: 5 }, (_, index) => ({
      id: `backfill-pending-${index + 1}`,
      fromUserId: `backfill-sender-pending-${index + 1}`,
      toUserId: "backfill-recipient",
      status: "PENDING" as const,
      createdAt: new Date(
        Date.parse("2026-07-20T10:00:00.000Z") + index * 60_000
      ),
      updatedAt: new Date(
        Date.parse("2026-07-21T11:00:00.000Z") + index * 60_000
      ),
    }));

    beforeAll(async () => {
      prisma = createTestPrisma();
      const userTimestamp = new Date("2026-07-01T00:00:00.000Z");
      await prisma.user.createMany({
        data: [
          "backfill-recipient",
          "backfill-sender-existing",
          "backfill-sender-accepted",
          "backfill-sender-declined",
          ...pendingRequests.map(({ fromUserId }) => fromUserId),
        ].map((id) => ({
          id,
          email: `${id}@example.test`,
          createdAt: userTimestamp,
          updatedAt: userTimestamp,
        })),
      });

      await prisma.friendRequest.createMany({
        data: [
          {
            id: "backfill-existing",
            fromUserId: "backfill-sender-existing",
            toUserId: "backfill-recipient",
            status: "PENDING",
            createdAt: userTimestamp,
            updatedAt: userTimestamp,
          },
          ...pendingRequests,
          {
            id: "backfill-accepted",
            fromUserId: "backfill-sender-accepted",
            toUserId: "backfill-recipient",
            status: "ACCEPTED",
            createdAt: userTimestamp,
            updatedAt: userTimestamp,
          },
          {
            id: "backfill-declined",
            fromUserId: "backfill-sender-declined",
            toUserId: "backfill-recipient",
            status: "DECLINED",
            createdAt: userTimestamp,
            updatedAt: userTimestamp,
          },
        ],
      });

      await prisma.notification.create({
        data: {
          id: "backfill-preexisting-notification",
          userId: "backfill-recipient",
          type: "FRIEND_REQUEST",
          status: "READ",
          actorUserId: "backfill-sender-existing",
          referenceId: "backfill-existing",
          createdAt: notificationCreated,
          updatedAt: notificationUpdated,
        },
      });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("maps every pending request exactly once and preserves existing rows", async () => {
      await expect(prisma.$executeRawUnsafe(migration)).resolves.toBe(5);
      await expect(prisma.$executeRawUnsafe(migration)).resolves.toBe(0);

      const notifications = await prisma.notification.findMany({
        where: {
          referenceId: {
            in: [
              "backfill-existing",
              "backfill-accepted",
              "backfill-declined",
              ...pendingRequests.map(({ id }) => id),
            ],
          },
        },
        select: {
          userId: true,
          type: true,
          status: true,
          actorUserId: true,
          referenceId: true,
          payload: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { referenceId: "asc" },
      });

      expect(notifications).toEqual([
        {
          userId: "backfill-recipient",
          type: "FRIEND_REQUEST",
          status: "READ",
          actorUserId: "backfill-sender-existing",
          referenceId: "backfill-existing",
          payload: null,
          createdAt: notificationCreated,
          updatedAt: notificationUpdated,
        },
        ...pendingRequests.map((request) => ({
          userId: request.toUserId,
          type: "FRIEND_REQUEST" as const,
          status: "PENDING" as const,
          actorUserId: request.fromUserId,
          referenceId: request.id,
          payload: null,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        })),
      ]);
    });
  }
);
