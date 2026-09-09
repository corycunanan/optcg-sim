import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { CARD_PUBLIC_SELECT } from "@/lib/cards/card-select";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));

function applyTopLevelSelect(row: unknown, query: unknown) {
  if (!row || typeof row !== "object") return row;

  const select = (query as { select?: Record<string, unknown> }).select;
  if (!select) return row;

  return Object.fromEntries(
    Object.keys(select).map((key) => [key, (row as Record<string, unknown>)[key]]),
  );
}

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      update: async (...args: unknown[]) =>
        applyTopLevelSelect(await updateMock(...args), args[0]),
      findUnique: async (...args: unknown[]) =>
        applyTopLevelSelect(await findUniqueMock(...args), args[0]),
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
      effectTags: ["category:rule_modification"],
      effectTraits: [],
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
      select: {
        ...CARD_PUBLIC_SELECT,
        artVariants: true,
        cardSets: { orderBy: { isOrigin: "desc" } },
        erratas: { orderBy: { date: "desc" } },
      },
    });
    expect(await res.json()).toEqual({ data: detailCard });
  });

  it("omits pipeline-only image fallback state", async () => {
    findUniqueMock.mockResolvedValue({
      id: "OP01-075",
      name: "Pacifista",
      imageIsVariantFallback: true,
      artVariants: [],
      cardSets: [],
      erratas: [],
    });

    const res = await GET(
      new NextRequest("http://localhost/api/cards/OP01-075"),
      { params: Promise.resolve({ id: "OP01-075" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).not.toHaveProperty("imageIsVariantFallback");
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

  it("omits pipeline-only image fallback state from updates", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    updateMock.mockResolvedValue({
      id: "OP01-001",
      name: "Updated",
      imageIsVariantFallback: true,
      artVariants: [],
      cardSets: [],
    });

    const res = await PATCH(buildRequest(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).not.toHaveProperty("imageIsVariantFallback");
  });
});
