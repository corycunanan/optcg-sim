import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const userFindManyMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => userFindManyMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: (...args: unknown[]) => rateLimitMock(...args) },
}));

const { GET } = await import("./route");

function buildRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/users/search${query ? `?q=${encodeURIComponent(query)}` : ""}`
  );
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  userFindManyMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  userFindManyMock.mockResolvedValue([]);
});

describe("GET /api/users/search", () => {
  it("returns an empty list when no query is provided", async () => {
    const res = await GET(buildRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects a 1-2 character query before Prisma", async () => {
    const res = await GET(buildRequest("lu"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Search query must be at least 3 characters",
      code: "SEARCH_QUERY_TOO_SHORT",
    });
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("trims and preserves case-insensitive substring search for 3+ characters", async () => {
    const res = await GET(buildRequest("  luf  "));

    expect(res.status).toBe(200);
    expect(userFindManyMock).toHaveBeenCalledWith({
      where: {
        username: { contains: "luf", mode: "insensitive" },
        id: { not: "user-1" },
      },
      select: { id: true, username: true, name: true, image: true },
      take: 10,
    });
  });
});
