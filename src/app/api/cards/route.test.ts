import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CARD_SEARCH_SELECT } from "@/lib/cards/card-select";

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

const searchCard = {
  id: "OP01-001",
  name: "Roronoa Zoro",
  color: ["Red"],
  type: "Leader",
  cost: null,
  power: 5000,
  counter: null,
  life: 5,
  traits: ["Supernovas", "Straw Hat Crew"],
  attribute: ["Strike"],
  effectText: "[Your Turn] All of your Characters gain +1000 power.",
  triggerText: null,
  imageUrl: "https://cdn.example.com/OP01-001.png",
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

  it("uses the explicit tooltip-ready Prisma select", async () => {
    await GET(new NextRequest("http://localhost/api/cards"));

    const query = findManyMock.mock.calls[0]?.[0];
    expect(query).toEqual(
      expect.objectContaining({
        select: CARD_SEARCH_SELECT,
      }),
    );
    expect(query).not.toHaveProperty("include");
    expect(query.select).toEqual({
      id: true,
      name: true,
      color: true,
      type: true,
      cost: true,
      power: true,
      counter: true,
      life: true,
      traits: true,
      attribute: true,
      effectText: true,
      triggerText: true,
      imageUrl: true,
    });
  });

  it("returns only the public tooltip-ready card shape", async () => {
    findManyMock.mockResolvedValue([searchCard]);
    countMock.mockResolvedValue(1);

    const res = await GET(new NextRequest("http://localhost/api/cards"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      data: [searchCard],
      pagination: { total: 1, page: 1, limit: 40, totalPages: 1 },
    });
    expect(Object.keys(body.data[0]).sort()).toEqual(
      [
        "id",
        "name",
        "color",
        "type",
        "cost",
        "power",
        "counter",
        "life",
        "traits",
        "attribute",
        "effectText",
        "triggerText",
        "imageUrl",
      ].sort(),
    );
    expect(body.data[0]).not.toHaveProperty("effectSchema");
    expect(body.data[0]).not.toHaveProperty("artVariants");
    expect(body.data[0]).not.toHaveProperty("cardSets");
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
