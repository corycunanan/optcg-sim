import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const searchRateLimitMock = vi.fn();
const apiRateLimitMock = vi.fn();
const notificationFindManyMock = vi.fn();
const notificationCountMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findMany: (...args: unknown[]) => notificationFindManyMock(...args),
      count: (...args: unknown[]) => notificationCountMock(...args),
      updateMany: (...args: unknown[]) => notificationUpdateManyMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: searchRateLimitMock },
  apiLimiter: { check: apiRateLimitMock },
}));

const { GET, PUT } = await import("./route");

function buildRequest(
  path = "/api/notifications",
  body?: unknown,
) {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  searchRateLimitMock.mockReset();
  apiRateLimitMock.mockReset();
  notificationFindManyMock.mockReset();
  notificationCountMock.mockReset();
  notificationUpdateManyMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  searchRateLimitMock.mockResolvedValue({ limited: false, remaining: 59 });
  apiRateLimitMock.mockResolvedValue({ limited: false, remaining: 29 });
  notificationFindManyMock.mockResolvedValue([]);
  notificationCountMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
  notificationUpdateManyMock.mockResolvedValue({ count: 0 });
  transactionMock.mockImplementation(async (callback) =>
    callback({
      notification: {
        findMany: notificationFindManyMock,
        count: notificationCountMock,
      },
    }),
  );
});

describe("GET /api/notifications", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await GET(buildRequest());

    expect(res.status).toBe(401);
    expect(notificationFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 429 before querying the inbox", async () => {
    searchRateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const res = await GET(buildRequest());

    expect(res.status).toBe(429);
    expect(notificationFindManyMock).not.toHaveBeenCalled();
  });

  it("paginates newest first and returns the full unread count", async () => {
    const rows = [{ id: "notification-3", status: "PENDING" }];
    notificationFindManyMock.mockResolvedValueOnce(rows);
    notificationCountMock.mockReset();
    notificationCountMock.mockResolvedValueOnce(5).mockResolvedValueOnce(3);

    const res = await GET(buildRequest("/api/notifications?page=2&limit=2"));

    expect(res.status).toBe(200);
    expect(notificationFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: {
        actor: {
          select: { id: true, username: true, name: true, image: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 2,
      take: 2,
    });
    expect(notificationCountMock).toHaveBeenNthCalledWith(1, {
      where: { userId: "user-1" },
    });
    expect(notificationCountMock).toHaveBeenNthCalledWith(2, {
      where: { userId: "user-1", status: "PENDING" },
    });
    expect(await res.json()).toEqual({
      data: {
        notifications: rows,
        unreadCount: 3,
        pagination: { total: 5, page: 2, limit: 2, totalPages: 3 },
      },
    });
    expect(transactionMock).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "RepeatableRead" },
    );
  });

  it("excludes another user's rows from the list and both counts", async () => {
    const stored = [
      { id: "owned", userId: "user-1", status: "PENDING" },
      { id: "foreign", userId: "user-2", status: "PENDING" },
    ];
    notificationFindManyMock.mockImplementation(async ({ where }) =>
      stored.filter((row) => !where.userId || row.userId === where.userId),
    );
    notificationCountMock.mockReset();
    notificationCountMock.mockImplementation(async ({ where }) =>
      stored.filter(
        (row) =>
          (!where.userId || row.userId === where.userId) &&
          (!where.status || row.status === where.status),
      ).length,
    );

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.notifications.map(({ id }: { id: string }) => id)).toEqual([
      "owned",
    ]);
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.unreadCount).toBe(1);
  });
});

describe("PUT /api/notifications", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PUT(buildRequest("/api/notifications", {
      action: "mark-all-read",
    }));

    expect(res.status).toBe(401);
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });

  it("marks every unread notification as read with one update query", async () => {
    const res = await PUT(buildRequest("/api/notifications", {
      action: "mark-all-read",
    }));

    expect(res.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
      data: { status: "READ" },
    });
    expect(await res.json()).toEqual({ success: true });
  });

  it("returns 429 before marking notifications read", async () => {
    apiRateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const res = await PUT(buildRequest("/api/notifications", {
      action: "mark-all-read",
    }));

    expect(res.status).toBe(429);
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not mark another user's unread notifications as read", async () => {
    const stored = [
      { id: "owned", userId: "user-1", status: "PENDING" },
      { id: "foreign", userId: "user-2", status: "PENDING" },
    ];
    notificationUpdateManyMock.mockImplementation(async ({ where, data }) => {
      let count = 0;
      for (const row of stored) {
        if (
          (!where.userId || row.userId === where.userId) &&
          (!where.status || row.status === where.status)
        ) {
          row.status = data.status;
          count += 1;
        }
      }
      return { count };
    });

    const res = await PUT(buildRequest("/api/notifications", {
      action: "mark-all-read",
    }));

    expect(res.status).toBe(200);
    expect(stored).toEqual([
      { id: "owned", userId: "user-1", status: "READ" },
      { id: "foreign", userId: "user-2", status: "PENDING" },
    ]);
  });
});
