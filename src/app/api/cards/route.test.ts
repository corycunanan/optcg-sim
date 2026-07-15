import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const createMock = vi.fn();
const findManyMock = vi.fn();
const countMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
  searchLimiter: { check: rateLimitMock },
}));

const { GET, POST } = await import("./route");

const validBody = {
  id: "OP99-999",
  name: "Test Card",
  type: "Character",
  color: ["Red"],
  blockNumber: 1,
};

function buildRequest(body: unknown = validBody) {
  return new NextRequest("http://localhost/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
  createMock.mockReset();
  findManyMock.mockReset();
  countMock.mockReset();
  rateLimitMock.mockReset();

  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  findManyMock.mockResolvedValue([]);
  countMock.mockResolvedValue(0);
});

describe("GET /api/cards search", () => {
  it("rejects a 1-2 character name query before Prisma", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cards?q=lu", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Search query must be at least 3 characters",
      code: "SEARCH_QUERY_TOO_SHORT",
    });
    expect(findManyMock).not.toHaveBeenCalled();
    expect(countMock).not.toHaveBeenCalled();
  });

  it("preserves case-insensitive substring search for 3+ characters", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cards?q=luf", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      }),
    );

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "luf", mode: "insensitive" } },
      }),
    );
    expect(countMock).toHaveBeenCalledWith({
      where: { name: { contains: "luf", mode: "insensitive" } },
    });
  });
});

describe("POST /api/cards admin gate", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(buildRequest());
    expect(res.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin user", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", isAdmin: false },
    });
    const res = await POST(buildRequest());
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates card (201) for admin user", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: "OP99-999", name: "Test Card" });

    const res = await POST(buildRequest());
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledOnce();
  });
});
