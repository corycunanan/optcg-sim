import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: rateLimitMock },
}));

const {
  checkPublicCardBrowseRateLimit,
  consumePublicCardBrowseRateLimit,
  PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER,
} = await import("./public-rate-limit");

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

  it("does not charge again when proxy already allowed the request", async () => {
    const requestHeaders = new Headers({
      [PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER]: "allowed",
    });

    const result = await checkPublicCardBrowseRateLimit(requestHeaders);

    expect(result).toEqual({ limited: false, remaining: null });
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("does not trust the proxy marker when consuming the request token", async () => {
    const requestHeaders = new Headers({
      [PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER]: "allowed",
      "x-forwarded-for": "203.0.113.10",
    });

    await consumePublicCardBrowseRateLimit(requestHeaders);

    expect(rateLimitMock).toHaveBeenCalledWith("card-search:203.0.113.10");
  });
});
