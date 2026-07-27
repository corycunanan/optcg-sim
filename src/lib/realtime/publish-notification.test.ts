import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  count: vi.fn(),
  notifyUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
      count: (...args: unknown[]) => mocks.count(...args),
    },
  },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => mocks.notifyUser(...args),
}));

import {
  publishNotificationUpdated,
  publishNotificationsReadAll,
} from "./publish-notification";

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.count.mockReset();
  mocks.notifyUser.mockReset();
  mocks.findFirst.mockResolvedValue({
    id: "notification-1",
    userId: "user-1",
    type: "FRIEND_REQUEST",
    status: "DISMISSED",
    actorUserId: "actor-1",
    referenceId: "request-1",
    payload: null,
    createdAt: new Date("2026-07-26T10:00:00.000Z"),
    updatedAt: new Date("2026-07-26T11:00:00.000Z"),
    actor: {
      id: "actor-1",
      username: "ace",
      name: "Ace",
      image: null,
    },
  });
  mocks.count.mockResolvedValue(2);
  mocks.notifyUser.mockResolvedValue(undefined);
});

describe("publishNotificationUpdated", () => {
  it("publishes the committed row and authoritative unread count", async () => {
    await publishNotificationUpdated("user-1", "notification-1");

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "notification-1", userId: "user-1" },
      include: {
        actor: {
          select: { id: true, username: true, name: true, image: true },
        },
      },
    });
    expect(mocks.count).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
    });
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
    expect(mocks.notifyUser).toHaveBeenCalledWith("user-1", {
      type: "notification:updated",
      notification: {
        id: "notification-1",
        userId: "user-1",
        type: "FRIEND_REQUEST",
        status: "DISMISSED",
        actorUserId: "actor-1",
        referenceId: "request-1",
        payload: null,
        createdAt: "2026-07-26T10:00:00.000Z",
        updatedAt: "2026-07-26T11:00:00.000Z",
        actor: {
          id: "actor-1",
          username: "ace",
          name: "Ace",
          image: null,
        },
      },
      unreadCount: 2,
    });
  });

  it("does not publish when the committed row is unavailable", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    await publishNotificationUpdated("user-1", "notification-1");

    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it("swallows post-commit database failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.findFirst.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      publishNotificationUpdated("user-1", "notification-1")
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[notifications:realtime-update] failed",
      expect.any(Error)
    );
    warn.mockRestore();
  });
});

describe("publishNotificationsReadAll", () => {
  it("publishes the authoritative post-commit badge count", async () => {
    mocks.count.mockResolvedValueOnce(0);

    await publishNotificationsReadAll("user-1");

    expect(mocks.notifyUser).toHaveBeenCalledWith("user-1", {
      type: "notification:read_all",
      unreadCount: 0,
    });
  });
});
