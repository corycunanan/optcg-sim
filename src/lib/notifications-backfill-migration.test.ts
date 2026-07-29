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

    const requestTimes = {
      pendingCreated: new Date("2026-07-20T10:00:00.000Z"),
      pendingUpdated: new Date("2026-07-21T11:00:00.000Z"),
      existingCreated: new Date("2026-07-22T12:00:00.000Z"),
      existingUpdated: new Date("2026-07-23T13:00:00.000Z"),
      notificationCreated: new Date("2026-07-24T14:00:00.000Z"),
      notificationUpdated: new Date("2026-07-25T15:00:00.000Z"),
    };

    beforeAll(async () => {
      prisma = createTestPrisma();
      const userTimestamp = new Date("2026-07-01T00:00:00.000Z");
      await prisma.user.createMany({
        data: [
          "backfill-recipient",
          "backfill-sender-pending",
          "backfill-sender-existing",
          "backfill-sender-accepted",
          "backfill-sender-declined",
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
            id: "backfill-pending",
            fromUserId: "backfill-sender-pending",
            toUserId: "backfill-recipient",
            status: "PENDING",
            createdAt: requestTimes.pendingCreated,
            updatedAt: requestTimes.pendingUpdated,
          },
          {
            id: "backfill-existing",
            fromUserId: "backfill-sender-existing",
            toUserId: "backfill-recipient",
            status: "PENDING",
            createdAt: requestTimes.existingCreated,
            updatedAt: requestTimes.existingUpdated,
          },
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
          createdAt: requestTimes.notificationCreated,
          updatedAt: requestTimes.notificationUpdated,
        },
      });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("maps pending requests, preserves timestamps, and excludes terminal requests", async () => {
      await prisma.$executeRawUnsafe(migration);

      const notifications = await prisma.notification.findMany({
        where: {
          referenceId: {
            in: [
              "backfill-pending",
              "backfill-existing",
              "backfill-accepted",
              "backfill-declined",
            ],
          },
        },
        orderBy: { referenceId: "asc" },
      });

      expect(notifications).toHaveLength(2);
      expect(notifications).toEqual([
        expect.objectContaining({
          id: "backfill-preexisting-notification",
          userId: "backfill-recipient",
          type: "FRIEND_REQUEST",
          status: "READ",
          actorUserId: "backfill-sender-existing",
          referenceId: "backfill-existing",
          createdAt: requestTimes.notificationCreated,
          updatedAt: requestTimes.notificationUpdated,
        }),
        expect.objectContaining({
          userId: "backfill-recipient",
          type: "FRIEND_REQUEST",
          status: "PENDING",
          actorUserId: "backfill-sender-pending",
          referenceId: "backfill-pending",
          payload: null,
          createdAt: requestTimes.pendingCreated,
          updatedAt: requestTimes.pendingUpdated,
        }),
      ]);
    });

    it("is idempotent when the migration is executed again", async () => {
      await expect(prisma.$executeRawUnsafe(migration)).resolves.toBe(0);

      await expect(
        prisma.notification.count({
          where: {
            referenceId: { in: ["backfill-pending", "backfill-existing"] },
          },
        })
      ).resolves.toBe(2);
    });
  }
);
