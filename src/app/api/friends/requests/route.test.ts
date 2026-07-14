import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const userFindUniqueMock = vi.fn();
const friendshipFindFirstMock = vi.fn();
const friendRequestFindFirstMock = vi.fn();
const friendRequestCreateMock = vi.fn();
const notifyUserMock = vi.fn();

// Run `after()` callbacks synchronously so the route's fanout is observable
// in unit tests.
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
    user: {
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    friendship: {
      findFirst: (...args: unknown[]) => friendshipFindFirstMock(...args),
    },
    friendRequest: {
      findFirst: (...args: unknown[]) => friendRequestFindFirstMock(...args),
      create: (...args: unknown[]) => friendRequestCreateMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  socialLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fan-out", () => ({
  notifyUser: (...args: unknown[]) => notifyUserMock(...args),
}));

const { POST } = await import("./route");

function buildRequest(body: unknown = { toUserId: "user-recipient" }) {
  return new NextRequest("http://localhost/api/friends/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  userFindUniqueMock.mockReset();
  friendshipFindFirstMock.mockReset();
  friendRequestFindFirstMock.mockReset();
  friendRequestCreateMock.mockReset();
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
  notifyUserMock.mockResolvedValue(undefined);
});

describe("POST /api/friends/requests", () => {
  it("calls notifyUser on the recipient with friend:request_received", async () => {
    const res = await POST(buildRequest());
    expect(res.status).toBe(201);

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
