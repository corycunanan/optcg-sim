import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const messageUpdateManyMock = vi.fn();
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
    message: {
      updateMany: (...args: unknown[]) => messageUpdateManyMock(...args),
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

function buildRequest(
  otherUserId: string,
  body: unknown = { throughCreatedAt: "2026-05-02T12:00:00.000Z" },
) {
  return {
    request: new NextRequest(`http://localhost/api/messages/${otherUserId}/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ userId: otherUserId }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  messageUpdateManyMock.mockReset();
  notifyUserMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-me" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  messageUpdateManyMock.mockResolvedValue({ count: 3 });
  notifyUserMock.mockResolvedValue(undefined);

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-02T12:00:01.234Z"));
});

describe("POST /api/messages/[userId]/read", () => {
  it("updates messages from the partner up to the cutoff and fires chat:read_to", async () => {
    const { request, params } = buildRequest("user-other");

    const res = await POST(request, { params });
    expect(res.status).toBe(200);

    expect(messageUpdateManyMock).toHaveBeenCalledTimes(1);
    const call = messageUpdateManyMock.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      fromUserId: "user-other",
      toUserId: "user-me",
      readAt: null,
    });
    expect((call?.where?.createdAt as { lte: Date }).lte).toEqual(
      new Date("2026-05-02T12:00:00.000Z"),
    );
    expect(call?.data).toEqual({
      readAt: new Date("2026-05-02T12:00:01.234Z"),
      read: true,
    });

    expect(notifyUserMock).toHaveBeenCalledWith("user-other", {
      type: "chat:read_to",
      fromUserId: "user-me",
      // Must match the client cutoff (= updateMany's createdAt.lte predicate),
      // not the server `now`. Broadcasting `now` would let the sender's
      // reducer over-ack messages they sent after the recipient computed
      // the cutoff but before this route ran.
      throughCreatedAt: "2026-05-02T12:00:00.000Z",
    });
  });

  it("does not over-ack messages sent after the client cutoff (race)", async () => {
    // Recipient saw last message at T1; sender posts a new one at T2 > T1
    // before this route runs at T3 > T2. The event must echo T1 so the
    // sender's reducer never marks the T2 row read locally.
    const T1 = "2026-05-02T12:00:00.000Z";
    const T3 = "2026-05-02T12:00:01.234Z";
    vi.setSystemTime(new Date(T3));

    const { request, params } = buildRequest("user-other", { throughCreatedAt: T1 });
    const res = await POST(request, { params });
    expect(res.status).toBe(200);

    const eventArg = notifyUserMock.mock.calls[0]?.[1] as {
      throughCreatedAt: string;
    };
    expect(eventArg.throughCreatedAt).toBe(T1);
    expect(eventArg.throughCreatedAt).not.toBe(T3);
  });

  it("does not fire chat:read_to when no rows were updated", async () => {
    messageUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    const { request, params } = buildRequest("user-other");

    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("rejects marking your own messages as read", async () => {
    const { request, params } = buildRequest("user-me");

    const res = await POST(request, { params });

    expect(res.status).toBe(400);
    expect(messageUpdateManyMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited and does not update", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest("user-other");

    const res = await POST(request, { params });

    expect(res.status).toBe(429);
    expect(messageUpdateManyMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid throughCreatedAt", async () => {
    const { request, params } = buildRequest("user-other", {
      throughCreatedAt: "not-a-date",
    });

    const res = await POST(request, { params });

    expect(res.status).toBe(400);
    expect(messageUpdateManyMock).not.toHaveBeenCalled();
  });
});
