import {
  NotificationStatus,
  NotificationType,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestPrisma,
  describeWithDatabase,
  getTestDatabaseUrl,
} from "@/test/database/harness";

const RECIPIENT_ID = "retention-recipient";
const OTHER_RECIPIENT_ID = "retention-other-recipient";
const ACTOR_ID = "retention-actor";
const TERMINAL_ACTOR_ID = "retention-terminal-actor";
const LIVE_REQUEST_ID = "retention-live-request";

describe("notification retention type coverage", () => {
  it("pins the notification types covered by the retention fixture", () => {
    // OPT-598: adding a type requires new retention fixtures before these SQL
    // type guards can become behaviorally observable.
    expect(Object.values(NotificationType)).toEqual(["FRIEND_REQUEST"]);
  });
});

describeWithDatabase("pruneNotifications PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let productionPrisma: PrismaClient;
  let pruneNotifications: (userId: string) => Promise<void>;

  beforeAll(async () => {
    const testUrl = getTestDatabaseUrl();
    process.env.DATABASE_URL = testUrl;
    process.env.DIRECT_DATABASE_URL = testUrl;

    prisma = createTestPrisma();
    ({ pruneNotifications } = await import("./notifications"));
    ({ prisma: productionPrisma } = await import("@/lib/db"));

    const timestamp = new Date("2026-07-29T12:00:00.000Z");
    await prisma.user.createMany({
      data: [
        {
          id: RECIPIENT_ID,
          email: "retention-recipient@example.test",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: OTHER_RECIPIENT_ID,
          email: "retention-other@example.test",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: ACTOR_ID,
          email: "retention-actor@example.test",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: TERMINAL_ACTOR_ID,
          email: "retention-terminal-actor@example.test",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });

    const statuses = Object.values(NotificationStatus);
    const baseTime = Date.parse("2026-07-29T00:00:00.000Z");
    const backlog = Array.from({ length: 110 }, (_, index) => ({
      id: `retention-backlog-${index.toString().padStart(3, "0")}`,
      userId: RECIPIENT_ID,
      type: NotificationType.FRIEND_REQUEST,
      status: statuses[index % statuses.length],
      actorUserId: ACTOR_ID,
      referenceId: null,
      createdAt: new Date(baseTime + (index === 9 ? 10 : index) * 60_000),
      updatedAt: new Date(baseTime + index * 60_000),
    }));

    await prisma.notification.createMany({
      data: [
        ...backlog,
        {
          id: "retention-live",
          userId: RECIPIENT_ID,
          type: "FRIEND_REQUEST",
          status: "DISMISSED",
          actorUserId: ACTOR_ID,
          referenceId: LIVE_REQUEST_ID,
          createdAt: new Date(baseTime - 10 * 60_000),
          updatedAt: timestamp,
        },
        {
          id: "retention-terminal",
          userId: RECIPIENT_ID,
          type: "FRIEND_REQUEST",
          status: "ACCEPTED",
          actorUserId: ACTOR_ID,
          referenceId: "retention-terminal-request",
          createdAt: new Date(baseTime - 5 * 60_000),
          updatedAt: timestamp,
        },
        {
          id: "retention-wrong-recipient",
          userId: RECIPIENT_ID,
          type: "FRIEND_REQUEST",
          status: "READ",
          actorUserId: ACTOR_ID,
          referenceId: "retention-other-recipient-request",
          createdAt: new Date(baseTime - 4 * 60_000),
          updatedAt: timestamp,
        },
        {
          id: "retention-dangling",
          userId: RECIPIENT_ID,
          type: "FRIEND_REQUEST",
          status: "DECLINED",
          actorUserId: ACTOR_ID,
          referenceId: "retention-missing-request",
          createdAt: new Date(baseTime - 3 * 60_000),
          updatedAt: timestamp,
        },
        {
          id: "retention-null-reference",
          userId: RECIPIENT_ID,
          type: "FRIEND_REQUEST",
          status: "PENDING",
          actorUserId: ACTOR_ID,
          referenceId: null,
          createdAt: new Date(baseTime - 2 * 60_000),
          updatedAt: timestamp,
        },
      ],
    });

    // Notifications intentionally precede requests so a concurrently executing
    // data-migration test can only observe a conflict-safe complete fixture.
    await prisma.friendRequest.createMany({
      data: [
        {
          id: LIVE_REQUEST_ID,
          fromUserId: ACTOR_ID,
          toUserId: RECIPIENT_ID,
          status: "PENDING",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: "retention-terminal-request",
          fromUserId: TERMINAL_ACTOR_ID,
          toUserId: RECIPIENT_ID,
          status: "ACCEPTED",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: "retention-other-recipient-request",
          fromUserId: ACTOR_ID,
          toUserId: OTHER_RECIPIENT_ID,
          status: "PENDING",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    });
  });

  afterAll(async () => {
    await productionPrisma.$disconnect();
    await prisma.$disconnect();
  });

  it("retains the exact newest backlog and every live request notification", async () => {
    await pruneNotifications(RECIPIENT_ID);

    const retained = await prisma.notification.findMany({
      where: { userId: RECIPIENT_ID },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const expectedIds = [
      ...Array.from(
        { length: 100 },
        (_, index) =>
          `retention-backlog-${(index + 10).toString().padStart(3, "0")}`
      ),
      "retention-live",
    ].sort();

    expect(retained.map(({ id }) => id)).toEqual(expectedIds);
  });
});
