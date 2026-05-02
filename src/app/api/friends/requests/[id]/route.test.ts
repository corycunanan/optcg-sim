import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const friendRequestFindFirstMock = vi.fn();
const friendRequestDeleteMock = vi.fn();
const friendshipCreateMock = vi.fn();
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
    },
    friendship: {
      create: (...args: unknown[]) => friendshipCreateMock(...args),
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
  friendshipCreateMock.mockReset();
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
  transactionMock.mockResolvedValue([
    {
      id: "ship-1",
      userAId: "user-accepter",
      userBId: "user-sender",
      createdAt: new Date("2026-05-02T12:00:00.000Z"),
    },
    {},
  ]);
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
});

describe("PUT /api/friends/requests/[id] — decline", () => {
  it("notifies the original sender with friend:request_declined including the decliner's id", async () => {
    friendRequestDeleteMock.mockResolvedValueOnce({});
    const { request, params } = buildRequest({ action: "decline" });

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-sender", {
      type: "friend:request_declined",
      requestId: "req-1",
      toUserId: "user-accepter",
    });
  });
});
