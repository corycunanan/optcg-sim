import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      update: (...args: unknown[]) => updateMock(...args),
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { GET, PATCH } = await import("./route");

function buildRequest(body: unknown = { name: "Updated" }) {
  return new NextRequest("http://localhost/api/cards/OP01-001", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "OP01-001" });

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
});

describe("GET /api/cards/[id] detail contract", () => {
  it("keeps relations, effect text, and legality data on the detail endpoint", async () => {
    const detailCard = {
      id: "OP01-075",
      name: "Pacifista",
      effectText: "This card may be included any number of times.",
      effectSchema: {
        rule_modifications: [
          { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
        ],
      },
      artVariants: [{ id: "art-1", imageUrl: "https://cdn.example.com/art.png" }],
      cardSets: [{ id: "set-1", setLabel: "OP-01" }],
      erratas: [],
    };
    findUniqueMock.mockResolvedValue(detailCard);
    const detailParams = Promise.resolve({ id: "OP01-075" });

    const res = await GET(
      new NextRequest("http://localhost/api/cards/OP01-075"),
      { params: detailParams },
    );

    expect(res.status).toBe(200);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "OP01-075" },
      include: {
        artVariants: true,
        cardSets: { orderBy: { isOrigin: "desc" } },
        erratas: { orderBy: { date: "desc" } },
      },
    });
    expect(await res.json()).toEqual({ data: detailCard });
  });
});

describe("PATCH /api/cards/[id] admin gate", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(buildRequest(), { params });
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin user", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", isAdmin: false },
    });
    const res = await PATCH(buildRequest(), { params });
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updates card (200) for admin user", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    updateMock.mockResolvedValue({ id: "OP01-001", name: "Updated" });
    const res = await PATCH(buildRequest(), { params });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });
});
