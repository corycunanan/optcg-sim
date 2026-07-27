import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const userFindUniqueMock = vi.fn();
const friendshipFindFirstMock = vi.fn();
const friendRequestFindFirstMock = vi.fn();
const friendRequestCreateMock = vi.fn();
const notificationCreateMock = vi.fn();
const notificationFindManyMock = vi.fn();
const notificationDeleteManyMock = vi.fn();
const transactionMock = vi.fn();
const notifyUserMock = vi.fn();
const afterCallbacks: Array<() => void | Promise<void>> = [];

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => afterCallbacks.push(cb),
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    friendship: {
      findFirst: (...args: unknown[]) => friendshipFindFirstMock(...args),
    },
    friendRequest: {
      findFirst: (...args: unknown[]) => friendRequestFindFirstMock(...args),
    },
    notification: {
      findMany: (...args: unknown[]) => notificationFindManyMock(...args),
      deleteMany: (...args: unknown[]) => notificationDeleteManyMock(...args),
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

const { POST } = await import("./route");

async function flushAfter() {
  while (afterCallbacks.length > 0) {
    await afterCallbacks.shift()?.();
  }
}

function buildRequest(body: unknown = { toUserId: "user-recipient" }) {
  return new NextRequest("http://localhost/api/friends/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  afterCallbacks.length = 0;
  authMock.mockReset();
  rateLimitMock.mockReset();
  userFindUniqueMock.mockReset();
  friendshipFindFirstMock.mockReset();
  friendRequestFindFirstMock.mockReset();
  friendRequestCreateMock.mockReset();
  notificationCreateMock.mockReset();
  notificationFindManyMock.mockReset();
  notificationDeleteManyMock.mockReset();
  transactionMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-sender" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  userFindUniqueMock.mockResolvedValue({ id: "user-recipient" });
  friendshipFindFirstMock.mockResolvedValue(null);
  friendRequestFindFirstMock.mockResolvedValue(null);
  friendRequestCreateMock.mockResolvedValue({
    id: "req-1",
    fromUserId: "user-sender",
    toUserId: "user-recipient",
    status: "PENDING",
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
    fromUser: {
      id: "user-sender",
      username: "ace",
      name: "Ace",
      image: null,
    },
    toUser: {
      id: "user-recipient",
      username: "luffy",
      name: "Luffy",
      image: null,
    },
  });
  notificationCreateMock.mockResolvedValue({ id: "notification-1" });
  notificationFindManyMock.mockResolvedValue([]);
  transactionMock.mockImplementation(async (callback) =>
    callback({
      friendRequest: { create: friendRequestCreateMock },
      notification: {
        create: notificationCreateMock,
      },
    }),
  );
  notifyUserMock.mockResolvedValue(undefined);
});

describe("POST /api/friends/requests", () => {
  it("creates the recipient notification in the friend-request transaction", async () => {
    const res = await POST(buildRequest());

    expect(res.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(notificationCreateMock).toHaveBeenCalledWith({
      data: {
        userId: "user-recipient",
        type: "FRIEND_REQUEST",
        actorUserId: "user-sender",
        referenceId: "req-1",
      },
    });
  });

  it("prunes only a bounded batch of resolved rows after the request commits", async () => {
    notificationFindManyMock.mockResolvedValueOnce([
      { id: "notification-old-1" },
      { id: "notification-old-2" },
    ]);

    const res = await POST(buildRequest());

    expect(res.status).toBe(201);
    expect(notificationFindManyMock).not.toHaveBeenCalled();

    await flushAfter();

    expect(notificationFindManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-recipient",
        status: { in: ["ACCEPTED", "DECLINED"] },
      },
      select: { id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 100,
      take: 25,
    });
    expect(notificationDeleteManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-recipient",
        status: { in: ["ACCEPTED", "DECLINED"] },
        id: { in: ["notification-old-1", "notification-old-2"] },
      },
    });
  });

  it("keeps a valid friend request when best-effort retention fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    notificationFindManyMock.mockRejectedValueOnce(new Error("retention unavailable"));

    const res = await POST(buildRequest());

    expect(res.status).toBe(201);
    expect(friendRequestCreateMock).toHaveBeenCalledTimes(1);
    expect(notificationCreateMock).toHaveBeenCalledTimes(1);

    await flushAfter();

    expect(errorSpy).toHaveBeenCalledWith(
      "[notifications:retention] failed",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("calls notifyUser on the recipient with friend:request_received", async () => {
    const res = await POST(buildRequest());
    expect(res.status).toBe(201);

    await flushAfter();

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-recipient", {
      type: "friend:request_received",
      request: {
        id: "req-1",
        fromUserId: "user-sender",
        toUserId: "user-recipient",
        createdAt: "2026-05-02T12:00:00.000Z",
        fromUser: {
          id: "user-sender",
          username: "ace",
          name: "Ace",
          image: null,
        },
      },
    });
  });

  it("does not fan out when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const res = await POST(buildRequest());

    expect(res.status).toBe(429);
    expect(friendRequestCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when sender targets self", async () => {
    const res = await POST(buildRequest({ toUserId: "user-sender" }));

    expect(res.status).toBe(400);
    expect(friendRequestCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when an existing friendship blocks the request", async () => {
    friendshipFindFirstMock.mockResolvedValueOnce({ id: "ship-1" });

    const res = await POST(buildRequest());

    expect(res.status).toBe(409);
    expect(friendRequestCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when a pending request already exists", async () => {
    friendRequestFindFirstMock.mockResolvedValueOnce({ id: "req-existing" });

    const res = await POST(buildRequest());

    expect(res.status).toBe(409);
    expect(friendRequestCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("returns 409 without fanout when the unordered-pair index wins a race", async () => {
    friendRequestCreateMock.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const res = await POST(buildRequest());

    expect(res.status).toBe(409);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
