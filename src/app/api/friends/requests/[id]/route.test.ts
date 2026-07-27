import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const friendRequestFindFirstMock = vi.fn();
const friendRequestDeleteMock = vi.fn();
const friendRequestDeleteManyMock = vi.fn();
const friendshipCreateMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const notifyUserMock = vi.fn();

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => {
      void cb();
    },
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    friendRequest: {
      findFirst: (...args: unknown[]) => friendRequestFindFirstMock(...args),
      delete: (...args: unknown[]) => friendRequestDeleteMock(...args),
      deleteMany: (...args: unknown[]) => friendRequestDeleteManyMock(...args),
    },
    friendship: {
      create: (...args: unknown[]) => friendshipCreateMock(...args),
    },
    notification: {
      updateMany: (...args: unknown[]) => notificationUpdateManyMock(...args),
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

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  friendRequestFindFirstMock.mockReset();
  friendRequestDeleteMock.mockReset();
  friendRequestDeleteManyMock.mockReset();
  friendshipCreateMock.mockReset();
  notificationUpdateManyMock.mockReset();
  transactionMock.mockReset();
  notifyUserMock.mockReset();

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
  transactionMock.mockImplementation(async (callback) => {
    if (typeof callback !== "function")
      throw new Error("Expected transaction callback");
    return callback({
      friendship: { create: friendshipCreateMock },
      friendRequest: {
        delete: friendRequestDeleteMock,
        deleteMany: friendRequestDeleteManyMock,
      },
      notification: { updateMany: notificationUpdateManyMock },
    });
  });
  notifyUserMock.mockResolvedValue(undefined);
});

describe("PUT /api/friends/requests/[id] — accept", () => {
  it("notifies the original sender with friend:request_accepted", async () => {
    const { request, params } = buildRequest({ action: "accept" });
    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
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
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-accepter",
        type: "FRIEND_REQUEST",
        referenceId: "req-1",
        status: { in: ["PENDING", "READ", "DISMISSED"] },
      },
      data: { status: "ACCEPTED" },
    });
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
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/friends/requests/[id] — decline", () => {
  it("notifies the original sender with friend:request_declined including the decliner's id", async () => {
    friendRequestDeleteMock.mockResolvedValueOnce({});
    const { request, params } = buildRequest({ action: "decline" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-sender", {
      type: "friend:request_declined",
      requestId: "req-1",
      toUserId: "user-accepter",
    });
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-accepter",
        type: "FRIEND_REQUEST",
        referenceId: "req-1",
        status: { in: ["PENDING", "READ", "DISMISSED"] },
      },
      data: { status: "DECLINED" },
    });
  });
});
