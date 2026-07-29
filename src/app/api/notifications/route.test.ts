import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIONABLE_NOTIFICATION_WHERE } from "@/lib/notification-order";

const authMock = vi.fn();
const searchRateLimitMock = vi.fn();
const apiRateLimitMock = vi.fn();
const notificationFindManyMock = vi.fn();
const notificationCountMock = vi.fn();
const notificationUpdateManyMock = vi.fn();
const transactionMock = vi.fn();
const publishNotificationsReadAllMock = vi.fn();
const afterCallbacks: Array<() => void | Promise<void>> = [];
const ACTOR_INCLUDE = {
  actor: {
    select: { id: true, username: true, name: true, image: true },
  },
} as const;
const NEWEST_FIRST = [{ createdAt: "desc" }, { id: "desc" }] as const;

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) =>
      afterCallbacks.push(callback),
  };
});

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
vi.mock("@/lib/realtime/publish-notification", () => ({
  publishNotificationsReadAll: (...args: unknown[]) =>
    publishNotificationsReadAllMock(...args),
}));

const { GET, PUT } = await import("./route");

async function flushAfter() {
  while (afterCallbacks.length > 0) await afterCallbacks.shift()?.();
}

function buildRequest(path = "/api/notifications", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function notificationRow(
  id: string,
  createdAt: string,
  overrides: Partial<{
    userId: string;
    type: string;
    status: string;
    referenceId: string | null;
  }> = {}
) {
  return {
    id,
    userId: "user-1",
    type: "FRIEND_REQUEST",
    status: "PENDING",
    referenceId: `request-${id}`,
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

beforeEach(() => {
  afterCallbacks.length = 0;
  authMock.mockReset();
  searchRateLimitMock.mockReset();
  apiRateLimitMock.mockReset();
  notificationFindManyMock.mockReset();
  notificationCountMock.mockReset();
  notificationUpdateManyMock.mockReset();
  transactionMock.mockReset();
  publishNotificationsReadAllMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  searchRateLimitMock.mockResolvedValue({ limited: false, remaining: 59 });
  apiRateLimitMock.mockResolvedValue({ limited: false, remaining: 29 });
  notificationFindManyMock.mockResolvedValue([]);
  notificationCountMock.mockResolvedValue(0);
  notificationUpdateManyMock.mockResolvedValue({ count: 0 });
  publishNotificationsReadAllMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (callback) =>
    callback({
      notification: {
        findMany: notificationFindManyMock,
        count: notificationCountMock,
      },
    })
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

  it("paginates actionable rows first and newest first within each group", async () => {
    const rows = [
      notificationRow("resolved-old", "2026-01-01", { status: "ACCEPTED" }),
      notificationRow("actionable-old", "2026-01-02"),
      notificationRow("resolved-new", "2026-01-05", { status: "DECLINED" }),
      notificationRow("actionable-new", "2026-01-04"),
      notificationRow("resolved-middle", "2026-01-03", {
        status: "DECLINED",
      }),
    ];
    notificationFindManyMock.mockResolvedValueOnce([rows[2], rows[4]]);
    notificationCountMock.mockReset();
    notificationCountMock
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);

    const res = await GET(buildRequest("/api/notifications?page=2&limit=2"));

    expect(res.status).toBe(200);
    expect(notificationFindManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        NOT: ACTIONABLE_NOTIFICATION_WHERE,
      },
      include: ACTOR_INCLUDE,
      orderBy: NEWEST_FIRST,
      skip: 0,
      take: 2,
    });
    expect(notificationCountMock).toHaveBeenNthCalledWith(1, {
      where: { userId: "user-1" },
    });
    expect(notificationCountMock).toHaveBeenNthCalledWith(2, {
      where: { userId: "user-1", status: "PENDING" },
    });
    expect(notificationCountMock).toHaveBeenNthCalledWith(3, {
      where: { userId: "user-1", ...ACTIONABLE_NOTIFICATION_WHERE },
    });
    expect(await res.json()).toEqual({
      data: {
        notifications: [rows[2], rows[4]].map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        unreadCount: 2,
        pagination: { total: 5, page: 2, limit: 2, totalPages: 3 },
      },
    });
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
  });

  it("keeps an old actionable request on page one past 20 newer resolved rows", async () => {
    const oldActionable = notificationRow(
      "old-actionable",
      "2026-01-01T00:00:00.000Z"
    );
    const newerResolved = Array.from({ length: 21 }, (_, index) =>
      notificationRow(
        `resolved-${index}`,
        new Date(Date.UTC(2026, 0, index + 2)).toISOString(),
        { status: index % 2 === 0 ? "DECLINED" : "ACCEPTED" }
      )
    );
    notificationFindManyMock
      .mockResolvedValueOnce([oldActionable])
      .mockResolvedValueOnce(newerResolved.slice().reverse().slice(0, 19));
    notificationCountMock.mockReset();
    notificationCountMock
      .mockResolvedValueOnce(22)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.data.notifications).toHaveLength(20);
    expect(body.data.notifications[0].id).toBe("old-actionable");
    expect(
      body.data.notifications.filter(
        ({ status }: { status: string }) => status === "PENDING"
      )
    ).toHaveLength(body.data.unreadCount);
  });

  it("returns every actionable row beyond the limit and paginates resolved history exactly", async () => {
    const actionableRows = Array.from({ length: 21 }, (_, index) =>
      notificationRow(
        `actionable-${index}`,
        new Date(Date.UTC(2026, 0, index + 1)).toISOString()
      )
    ).reverse();
    const resolvedRows = Array.from({ length: 20 }, (_, index) =>
      notificationRow(
        `resolved-${index}`,
        new Date(Date.UTC(2026, 1, index + 1)).toISOString(),
        { status: "ACCEPTED" }
      )
    ).reverse();
    notificationFindManyMock
      .mockImplementationOnce(async ({ take }) => actionableRows.slice(0, take))
      .mockResolvedValueOnce(resolvedRows);
    notificationCountMock.mockReset();
    for (let request = 0; request < 2; request += 1) {
      notificationCountMock
        .mockResolvedValueOnce(41)
        .mockResolvedValueOnce(21)
        .mockResolvedValueOnce(21);
    }

    const pageOne = await (
      await GET(buildRequest("/api/notifications?page=1&limit=20"))
    ).json();
    const pageTwo = await (
      await GET(buildRequest("/api/notifications?page=2&limit=20"))
    ).json();

    expect(
      pageOne.data.notifications.map(({ id }: { id: string }) => id)
    ).toEqual(actionableRows.map(({ id }) => id));
    expect(pageOne.data.notifications).toHaveLength(21);
    expect(pageOne.data.pagination.totalPages).toBe(2);
    expect(
      pageTwo.data.notifications.map(({ id }: { id: string }) => id)
    ).toEqual(resolvedRows.map(({ id }) => id));
    expect(pageTwo.data.pagination.totalPages).toBe(2);
    expect(
      new Set([
        ...pageOne.data.notifications.map(({ id }: { id: string }) => id),
        ...pageTwo.data.notifications.map(({ id }: { id: string }) => id),
      ]).size
    ).toBe(41);
    expect(notificationFindManyMock).toHaveBeenNthCalledWith(1, {
      where: { userId: "user-1", ...ACTIONABLE_NOTIFICATION_WHERE },
      include: ACTOR_INCLUDE,
      orderBy: NEWEST_FIRST,
      take: 21,
    });
    expect(notificationFindManyMock).toHaveBeenNthCalledWith(2, {
      where: {
        userId: "user-1",
        NOT: ACTIONABLE_NOTIFICATION_WHERE,
      },
      include: ACTOR_INCLUDE,
      orderBy: NEWEST_FIRST,
      skip: 0,
      take: 20,
    });
  });

  it("excludes another user's rows from the list and both counts", async () => {
    const owned = notificationRow("owned", "2026-01-01");
    notificationFindManyMock
      .mockResolvedValueOnce([owned])
      .mockResolvedValueOnce([]);
    notificationCountMock.mockReset();
    notificationCountMock.mockResolvedValue(1);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.notifications.map(({ id }: { id: string }) => id)).toEqual(
      ["owned"]
    );
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.unreadCount).toBe(1);
    expect(
      notificationFindManyMock.mock.calls.every(
        ([{ where }]) => where.userId === "user-1"
      )
    ).toBe(true);
    expect(
      notificationCountMock.mock.calls.every(
        ([{ where }]) => where.userId === "user-1"
      )
    ).toBe(true);
  });
});

describe("PUT /api/notifications", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValueOnce(null);

    const res = await PUT(
      buildRequest("/api/notifications", {
        action: "mark-all-read",
      })
    );

    expect(res.status).toBe(401);
    expect(notificationUpdateManyMock).not.toHaveBeenCalled();
  });

  it("marks every unread notification as read with one update query", async () => {
    notificationUpdateManyMock.mockResolvedValueOnce({ count: 2 });
    const res = await PUT(
      buildRequest("/api/notifications", {
        action: "mark-all-read",
      })
    );

    expect(res.status).toBe(200);
    expect(notificationUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(notificationUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
      data: { status: "READ" },
    });
    expect(publishNotificationsReadAllMock).not.toHaveBeenCalled();
    await flushAfter();
    expect(publishNotificationsReadAllMock).toHaveBeenCalledTimes(1);
    expect(publishNotificationsReadAllMock).toHaveBeenCalledWith("user-1");
    expect(await res.json()).toEqual({ success: true });
  });

  it("does not fan out when mark-all-read changes no rows", async () => {
    const res = await PUT(
      buildRequest("/api/notifications", {
        action: "mark-all-read",
      })
    );

    expect(res.status).toBe(200);
    await flushAfter();
    expect(publishNotificationsReadAllMock).not.toHaveBeenCalled();
  });

  it("keeps mark-all-read successful when post-commit fan-out fails", async () => {
    notificationUpdateManyMock.mockResolvedValueOnce({ count: 1 });
    publishNotificationsReadAllMock.mockRejectedValueOnce(
      new Error("realtime unavailable")
    );

    const res = await PUT(
      buildRequest("/api/notifications", {
        action: "mark-all-read",
      })
    );

    expect(res.status).toBe(200);
    await expect(flushAfter()).rejects.toThrow("realtime unavailable");
  });

  it("returns 429 before marking notifications read", async () => {
    apiRateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const res = await PUT(
      buildRequest("/api/notifications", {
        action: "mark-all-read",
      })
    );

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

    const res = await PUT(
      buildRequest("/api/notifications", {
        action: "mark-all-read",
      })
    );

    expect(res.status).toBe(200);
    expect(stored).toEqual([
      { id: "owned", userId: "user-1", status: "READ" },
      { id: "foreign", userId: "user-2", status: "PENDING" },
    ]);
  });
});
