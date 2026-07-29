import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_ACTION_RATE_LIMIT_CHARGED } from "@/lib/friend-request-rate-limit";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const friendRequestFindFirstMock = vi.fn();
const friendRequestDeleteManyMock = vi.fn();
const friendshipCreateMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const notificationFindFirstMock = vi.fn();
const notificationCountMock = vi.fn();
const transactionMock = vi.fn();
const notifyUserMock = vi.fn();
const pruneNotificationsMock = vi.fn();

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => {
      void Promise.resolve(cb()).catch(() => undefined);
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    friendRequest: {
      findFirst: (...args: unknown[]) => friendRequestFindFirstMock(...args),
      deleteMany: (...args: unknown[]) => friendRequestDeleteManyMock(...args),
    },
    friendship: {
      create: (...args: unknown[]) => friendshipCreateMock(...args),
    },
    notification: {
      updateMany: (...args: unknown[]) => notificationUpdateManyMock(...args),
      findFirst: (...args: unknown[]) => notificationFindFirstMock(...args),
      count: (...args: unknown[]) => notificationCountMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  socialLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));
vi.mock("@/lib/notifications", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/notifications")>();
  return {
    ...actual,
    pruneNotifications: (...args: unknown[]) => pruneNotificationsMock(...args),
  };
});

const { PUT } = await import("./route");

function buildRequest(body: { action: "accept" | "decline" }) {
  return {
    request: new NextRequest("http://localhost/api/friends/requests/req-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id: "req-1" }),
  };
}

function resolvedNotificationEvent(status: "ACCEPTED" | "DECLINED") {
  return {
    type: "notification:resolved",
    notification: {
      id: "notification-1",
      userId: "user-accepter",
      type: "FRIEND_REQUEST",
      status,
      actorUserId: "user-sender",
      referenceId: "req-1",
      payload: null,
      createdAt: "2026-05-02T11:00:00.000Z",
      updatedAt: "2026-05-02T12:00:00.000Z",
      actor: {
        id: "user-sender",
        username: "ace",
        name: "Ace",
        image: null,
      },
    },
    unreadCount: 0,
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  friendRequestFindFirstMock.mockReset();
  friendRequestDeleteManyMock.mockReset();
  friendshipCreateMock.mockReset();
  notificationUpdateManyMock.mockReset();
  notificationFindFirstMock.mockReset();
  notificationCountMock.mockReset();
  transactionMock.mockReset();
  notifyUserMock.mockReset();
  pruneNotificationsMock.mockReset();

  authMock.mockResolvedValue({
    user: {
      id: "user-accepter",
      username: "luffy",
      name: "Luffy",
      image: null,
    },
  });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  friendRequestFindFirstMock.mockResolvedValue({
    id: "req-1",
    fromUserId: "user-sender",
    toUserId: "user-accepter",
    status: "PENDING",
    createdAt: new Date("2026-05-02T11:00:00.000Z"),
    fromUser: {
      id: "user-sender",
      username: "ace",
      name: "Ace",
      image: null,
    },
  });
  friendshipCreateMock.mockResolvedValue({
    id: "ship-1",
    userAId: "user-accepter",
    userBId: "user-sender",
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
  });
  friendRequestDeleteManyMock.mockResolvedValue({ count: 1 });
  notificationFindFirstMock.mockImplementation(async () => ({
    id: "notification-1",
    userId: "user-accepter",
    type: "FRIEND_REQUEST",
    status:
      notificationUpdateManyMock.mock.calls.at(-1)?.[0].data.status ??
      "PENDING",
    actorUserId: "user-sender",
    referenceId: "req-1",
    payload: null,
    createdAt: new Date("2026-05-02T11:00:00.000Z"),
    updatedAt: new Date("2026-05-02T12:00:00.000Z"),
    actor: {
      id: "user-sender",
      username: "ace",
      name: "Ace",
      image: null,
    },
  }));
  notificationCountMock.mockResolvedValue(0);
  transactionMock.mockImplementation(async (callback) => {
    if (typeof callback !== "function")
      throw new Error("Expected transaction callback");
    return callback({
      friendship: { create: friendshipCreateMock },
      friendRequest: {
        deleteMany: friendRequestDeleteManyMock,
      },
      notification: {
        updateMany: notificationUpdateManyMock,
        findFirst: notificationFindFirstMock,
        count: notificationCountMock,
      },
    });
  });
  notifyUserMock.mockResolvedValue(undefined);
  pruneNotificationsMock.mockResolvedValue(undefined);
});

describe("PUT /api/friends/requests/[id] — accept", () => {
  it("does not double-charge a notification action that was already limited", async () => {
    const { request, params } = buildRequest({ action: "accept" });

    const res = await PUT(request, {
      params,
      rateLimitCharge: NOTIFICATION_ACTION_RATE_LIMIT_CHARGED,
    });

    expect(res.status).toBe(200);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(pruneNotificationsMock).not.toHaveBeenCalled();
  });

  it("notifies the original sender with friend:request_accepted", async () => {
    const { request, params } = buildRequest({ action: "accept" });
    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(notifyUserMock).toHaveBeenCalledTimes(2);
    expect(notifyUserMock).toHaveBeenCalledWith("user-sender", {
      type: "friend:request_accepted",
      request: {
        id: "req-1",
        fromUserId: "user-sender",
        toUserId: "user-accepter",
        createdAt: "2026-05-02T11:00:00.000Z",
        fromUser: {
          id: "user-sender",
          username: "ace",
          name: "Ace",
          image: null,
        },
      },
      friendship: {
        id: "ship-1",
        createdAt: "2026-05-02T12:00:00.000Z",
        user: {
          id: "user-accepter",
          username: "luffy",
          name: "Luffy",
          image: null,
        },
      },
    });
    expect(notifyUserMock).toHaveBeenCalledWith(
      "user-accepter",
      resolvedNotificationEvent("ACCEPTED")
    );
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-accepter",
        type: "FRIEND_REQUEST",
        referenceId: "req-1",
        status: { in: ["PENDING", "READ", "DISMISSED"] },
      },
      data: { status: "ACCEPTED" },
    });
    expect(pruneNotificationsMock).toHaveBeenCalledWith("user-accepter");
  });

  it("does not fan out when the request is not found", async () => {
    friendRequestFindFirstMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest({ action: "accept" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest({ action: "accept" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(429);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not create a friendship when a concurrent decline removed the request", async () => {
    friendRequestDeleteManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest({ action: "accept" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(404);
    expect(friendshipCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("is idempotent when a concurrent acceptance already created the friendship", async () => {
    friendshipCreateMock.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );
    const { request, params } = buildRequest({ action: "accept" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(friendRequestDeleteManyMock).toHaveBeenCalledTimes(2);
    expect(friendRequestDeleteManyMock).toHaveBeenNthCalledWith(1, {
      where: {
        id: "req-1",
        toUserId: "user-accepter",
        status: "PENDING",
      },
    });
    expect(friendRequestDeleteManyMock).toHaveBeenNthCalledWith(2, {
      where: {
        status: "PENDING",
        OR: [
          { fromUserId: "user-accepter", toUserId: "user-sender" },
          { fromUserId: "user-sender", toUserId: "user-accepter" },
        ],
      },
    });
    expect(
      notifyUserMock.mock.calls.filter(
        ([, event]) => event.type === "friend:request_accepted"
      )
    ).toHaveLength(0);
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith(
      "user-accepter",
      resolvedNotificationEvent("ACCEPTED")
    );
    expect(pruneNotificationsMock).toHaveBeenCalledWith("user-accepter");
  });
});

describe("PUT /api/friends/requests/[id] — decline", () => {
  it("notifies the original sender with friend:request_declined including the decliner's id", async () => {
    const { request, params } = buildRequest({ action: "decline" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(friendRequestDeleteManyMock).toHaveBeenCalledWith({
      where: {
        id: "req-1",
        toUserId: "user-accepter",
        status: "PENDING",
      },
    });
    expect(notifyUserMock).toHaveBeenCalledTimes(2);
    expect(notifyUserMock).toHaveBeenCalledWith("user-sender", {
      type: "friend:request_declined",
      requestId: "req-1",
      toUserId: "user-accepter",
    });
    expect(notifyUserMock).toHaveBeenCalledWith(
      "user-accepter",
      resolvedNotificationEvent("DECLINED")
    );
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-accepter",
        type: "FRIEND_REQUEST",
        referenceId: "req-1",
        status: { in: ["PENDING", "READ", "DISMISSED"] },
      },
      data: { status: "DECLINED" },
    });
    expect(pruneNotificationsMock).toHaveBeenCalledWith("user-accepter");
  });

  it("keeps the decline committed when best-effort background work fails", async () => {
    notifyUserMock.mockRejectedValue(new Error("realtime unavailable"));
    pruneNotificationsMock.mockRejectedValue(
      new Error("retention unavailable")
    );
    const { request, params } = buildRequest({ action: "decline" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(pruneNotificationsMock).toHaveBeenCalledWith("user-accepter");
  });

  it("keeps a legacy request resolvable when its notification row is missing", async () => {
    notificationFindFirstMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest({ action: "decline" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-sender", {
      type: "friend:request_declined",
      requestId: "req-1",
      toUserId: "user-accepter",
    });
  });

  it("returns 404 when a concurrent legacy decline already removed the request", async () => {
    friendRequestDeleteManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest({ action: "decline" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Request not found" });
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
