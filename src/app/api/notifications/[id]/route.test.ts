import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_ACTION_RATE_LIMIT_CHARGED } from "@/lib/friend-request-rate-limit";

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
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not reveal or update another user's notification", async () => {
    const foreign = {
      id: "notification-1",
      userId: "user-2",
      type: "FRIEND_REQUEST",
      status: "PENDING",
      referenceId: "request-1",
    };
    notificationFindFirstMock.mockImplementationOnce(async ({ where }) =>
      !where.userId || where.userId === foreign.userId ? foreign : null,
    );
    const { request, params } = buildRequest("dismiss");

    const res = await PUT(request, { params });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Notification not found" });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not mutate a notification that is no longer owned at write time", async () => {
    const stored = {
      id: "notification-1",
      userId: "user-1",
      type: "FRIEND_REQUEST",
      status: "PENDING",
      referenceId: "request-1",
    };
    notificationFindFirstMock.mockImplementationOnce(async () => {
      const snapshot = { ...stored };
      stored.userId = "user-2";
      return snapshot;
    });
    notificationUpdateManyMock.mockImplementationOnce(async ({ where, data }) => {
      if (
        (!where.userId || where.userId === stored.userId) &&
        (!where.status || where.status.in.includes(stored.status))
      ) {
        stored.status = data.status;
        return { count: 1 };
      }
      return { count: 0 };
    });
    const { request, params } = buildRequest("read");

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(stored.status).toBe("PENDING");
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

  it.each(["read", "dismiss"] as const)(
    "does not let %s overwrite a terminal notification",
    async (action) => {
      const stored = { status: "ACCEPTED" };
      notificationFindFirstMock.mockResolvedValueOnce({
        type: "FRIEND_REQUEST",
        status: stored.status,
        referenceId: "request-1",
      });
      notificationUpdateManyMock.mockImplementationOnce(
        async ({ where, data }) => {
          if (!where.status || where.status.in.includes(stored.status)) {
            stored.status = data.status;
            return { count: 1 };
          }
          return { count: 0 };
        },
      );
      const { request, params } = buildRequest(action);

      const res = await PUT(request, { params });

      expect(res.status).toBe(200);
      expect(stored.status).toBe("ACCEPTED");
    },
  );

  it.each(["accept", "decline"] as const)(
    "proxies %s to the referenced friend request",
    async (action) => {
      const { request, params } = buildRequest(action);

      const res = await PUT(request, { params });

      expect(res.status).toBe(200);
      expect(resolveFriendRequestMock).toHaveBeenCalledTimes(1);
      expect(rateLimitMock).toHaveBeenCalledTimes(1);
      const [proxiedRequest, context] = resolveFriendRequestMock.mock.calls[0];
      expect(proxiedRequest.nextUrl.pathname).toBe(
        "/api/friends/requests/request-1",
      );
      expect(await proxiedRequest.json()).toEqual({ action });
      await expect(context.params).resolves.toEqual({ id: "request-1" });
      expect(context.rateLimitCharge).toBe(
        NOTIFICATION_ACTION_RATE_LIMIT_CHARGED,
      );
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
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(resolveFriendRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    ["ACCEPTED", "decline"],
    ["DECLINED", "accept"],
  ] as const)(
    "rejects %s notification resolved with conflicting %s action",
    async (status, action) => {
      notificationFindFirstMock.mockResolvedValueOnce({
        type: "FRIEND_REQUEST",
        status,
        referenceId: "request-1",
      });
      const { request, params } = buildRequest(action);

      const res = await PUT(request, { params });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: `Notification already ${status.toLowerCase()}`,
      });
      expect(rateLimitMock).toHaveBeenCalledTimes(1);
      expect(resolveFriendRequestMock).not.toHaveBeenCalled();
    },
  );

  it("charges the limiter before returning 422 for a non-actionable notification", async () => {
    notificationFindFirstMock.mockResolvedValueOnce({
      type: "FRIEND_REQUEST",
      status: "PENDING",
      referenceId: null,
    });
    const { request, params } = buildRequest("accept");

    const res = await PUT(request, { params });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Notification action unavailable",
    });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
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

  it("handles a concurrent legacy decline idempotently", async () => {
    resolveFriendRequestMock.mockResolvedValueOnce(
      NextResponse.json({ error: "Request not found" }, { status: 404 }),
    );
    notificationFindFirstMock
      .mockResolvedValueOnce({
        type: "FRIEND_REQUEST",
        status: "PENDING",
        referenceId: "request-1",
      })
      .mockResolvedValueOnce({ status: "DECLINED" });
    const { request, params } = buildRequest("decline");

    const res = await PUT(request, { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
