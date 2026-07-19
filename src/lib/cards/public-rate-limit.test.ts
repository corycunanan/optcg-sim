import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: rateLimitMock },
}));

const { checkPublicCardBrowseRateLimit } = await import("./public-rate-limit");

beforeEach(() => {
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 59 });
});

describe("checkPublicCardBrowseRateLimit", () => {
  it("uses the same first-forwarded-IP key as GET /api/cards", async () => {
    const requestHeaders = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.4",
    });

    await checkPublicCardBrowseRateLimit(requestHeaders);

    expect(rateLimitMock).toHaveBeenCalledWith("card-search:203.0.113.10");
  });

  it("shares the API fallback key when no forwarded IP is available", async () => {
    await checkPublicCardBrowseRateLimit(new Headers());

    expect(rateLimitMock).toHaveBeenCalledWith("card-search:unknown");
  });
});
