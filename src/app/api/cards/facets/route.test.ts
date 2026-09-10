import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EFFECT_FACET_GROUPS } from "@shared/effect-facets";
import { CardFacetVocabularySchema } from "@/lib/validators/cards";

const queryRawMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: (...args: unknown[]) => rateLimitMock(...args) },
}));

const { GET } = await import("./route");

beforeEach(() => {
  queryRawMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 59 });
});

describe("GET /api/cards/facets", () => {
  it("returns sorted facet vocabulary with the shared tag groups", async () => {
    queryRawMock
      .mockResolvedValueOnce([
        { value: "Straw Hat Crew" },
        { value: "Animal" },
        { value: "Animal" },
      ])
      .mockResolvedValueOnce([
        { value: "Straw Hat Crew" },
        { value: "Navy" },
        { value: "Navy" },
      ]);

    const response = await GET(
      new NextRequest("http://localhost/api/cards/facets", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("card-search:203.0.113.10");
    expect(body).toEqual({
      data: {
        traits: ["Animal", "Straw Hat Crew"],
        effectTraits: ["Navy", "Straw Hat Crew"],
        groups: EFFECT_FACET_GROUPS,
      },
    });
    expect(CardFacetVocabularySchema.parse(body)).toEqual(body);
    const cacheControl = response.headers.get("Cache-Control");
    const maxAge = Number(cacheControl?.match(/(?:^|,\s*)max-age=(\d+)/)?.[1]);
    expect(cacheControl).toMatch(/(?:^|,\s*)public(?:,|$)/);
    expect(maxAge).toBeGreaterThanOrEqual(3600);
  });

  it("does not cache a database error response", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("unavailable"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await GET(
        new NextRequest("http://localhost/api/cards/facets")
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "Failed to load card facets",
      });
      expect(response.headers.get("Cache-Control")).toBeNull();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("returns 429 before querying Prisma when rate limited", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });

    const response = await GET(
      new NextRequest("http://localhost/api/cards/facets", {
        headers: { "x-optcg-card-browse-rate-limit": "allowed" },
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(await response.json()).toEqual({
      error: "Too many requests. Try again later.",
    });
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
