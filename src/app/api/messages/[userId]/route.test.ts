import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const userFindUniqueMock = vi.fn();
const messageCreateMock = vi.fn();
const notifyUserMock = vi.fn();

// Run `after()` callbacks synchronously so the route's fanout is observable
// in unit tests; the production behavior (post-response scheduling) is owned
// by Next.js itself.
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
    message: {
      create: (...args: unknown[]) => messageCreateMock(...args),
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

function buildRequest(toUserId: string, body: unknown = { body: "hello" }) {
  return {
    request: new NextRequest(`http://localhost/api/messages/${toUserId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ userId: toUserId }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  userFindUniqueMock.mockReset();
  messageCreateMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-sender" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  userFindUniqueMock.mockResolvedValue({ id: "user-recipient" });
  messageCreateMock.mockResolvedValue({
    id: "msg-1",
    fromUserId: "user-sender",
    toUserId: "user-recipient",
    body: "hello",
    read: false,
    readAt: null,
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
    fromUser: {
      id: "user-sender",
      username: "ace",
      name: "Ace",
      image: null,
    },
  });
  notifyUserMock.mockResolvedValue(undefined);
});

describe("POST /api/messages/[userId]", () => {
  it("calls notifyUser on the recipient with the serialized message:new event", async () => {
    const { request, params } = buildRequest("user-recipient");

    const res = await POST(request, { params });
    expect(res.status).toBe(201);

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith("user-recipient", {
      type: "message:new",
      message: {
        id: "msg-1",
        fromUserId: "user-sender",
        toUserId: "user-recipient",
        body: "hello",
        createdAt: "2026-05-02T12:00:00.000Z",
        readAt: null,
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
    const { request, params } = buildRequest("user-recipient");

    const res = await POST(request, { params });

    expect(res.status).toBe(429);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does not fan out when the recipient does not exist", async () => {
    userFindUniqueMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest("user-ghost");

    const res = await POST(request, { params });

    expect(res.status).toBe(404);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects messages to self without fanning out", async () => {
    const { request, params } = buildRequest("user-sender");

    const res = await POST(request, { params });

    expect(res.status).toBe(400);
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });
});
