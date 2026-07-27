import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const notificationFindFirstMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const resolveFriendRequestMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findFirst: (...args: unknown[]) => notificationFindFirstMock(...args),
      updateMany: (...args: unknown[]) => notificationUpdateManyMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/app/api/friends/requests/[id]/route", () => ({
  PUT: (...args: unknown[]) => resolveFriendRequestMock(...args),
}));

const { PUT } = await import("./route");

function buildRequest(action: "read" | "dismiss" | "accept" | "decline") {
  return {
    request: new NextRequest("http://localhost/api/notifications/notification-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
    params: Promise.resolve({ id: "notification-1" }),
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  notificationFindFirstMock.mockReset();
  notificationUpdateManyMock.mockReset();
  resolveFriendRequestMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 29 });
  notificationFindFirstMock.mockResolvedValue({
    type: "FRIEND_REQUEST",
    status: "PENDING",
    referenceId: "request-1",
  });
  notificationUpdateManyMock.mockResolvedValue({ count: 1 });
  resolveFriendRequestMock.mockResolvedValue(
    NextResponse.json({ success: true }),
  );
});

describe("PUT /api/notifications/[id]", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest("read");

    const res = await PUT(request, { params });

    expect(res.status).toBe(401);
    expect(notificationFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 429 before updating a notification", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const { request, params } = buildRequest("read");

    const res = await PUT(request, { params });

    expect(res.status).toBe(429);
    expect(notificationFindFirstMock).not.toHaveBeenCalled();
  });

  it("does not reveal or update another user's notification", async () => {
    notificationFindFirstMock.mockResolvedValueOnce(null);
    const { request, params } = buildRequest("dismiss");

    const res = await PUT(request, { params });

    expect(res.status).toBe(404);
    expect(notificationFindFirstMock).toHaveBeenCalledWith({
      where: { id: "notification-1", userId: "user-1" },
      select: { type: true, status: true, referenceId: true },
    });
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });

  it("marks an owned notification read", async () => {
    const { request, params } = buildRequest("read");

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "notification-1",
        userId: "user-1",
        status: { in: ["PENDING", "READ"] },
      },
      data: { status: "READ" },
    });
  });

  it.each(["accept", "decline"] as const)(
    "proxies %s to the referenced friend request",
    async (action) => {
      const { request, params } = buildRequest(action);

      const res = await PUT(request, { params });

      expect(res.status).toBe(200);
      expect(resolveFriendRequestMock).toHaveBeenCalledTimes(1);
      const [proxiedRequest, context] = resolveFriendRequestMock.mock.calls[0];
      expect(proxiedRequest.nextUrl.pathname).toBe(
        "/api/friends/requests/request-1",
      );
      expect(await proxiedRequest.json()).toEqual({ action });
      await expect(context.params).resolves.toEqual({ id: "request-1" });
    },
  );

  it("is idempotent when the notification is already accepted", async () => {
    notificationFindFirstMock.mockResolvedValueOnce({
      type: "FRIEND_REQUEST",
      status: "ACCEPTED",
      referenceId: "request-1",
    });
    const { request, params } = buildRequest("accept");

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(resolveFriendRequestMock).not.toHaveBeenCalled();
  });

  it("handles a concurrent legacy acceptance idempotently", async () => {
    resolveFriendRequestMock.mockResolvedValueOnce(
      NextResponse.json({ error: "Request not found" }, { status: 404 }),
    );
    notificationFindFirstMock
      .mockResolvedValueOnce({
        type: "FRIEND_REQUEST",
        status: "PENDING",
        referenceId: "request-1",
      })
      .mockResolvedValueOnce({ status: "ACCEPTED" });
    const { request, params } = buildRequest("accept");

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
