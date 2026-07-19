import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthRequest } from "next-auth";
import { NextRequest } from "next/server";

const rateLimitMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: (handler: unknown) => handler,
}));
vi.mock("@/lib/cards/public-rate-limit", () => ({
  consumePublicCardBrowseRateLimit: rateLimitMock,
  PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER: "x-optcg-card-browse-rate-limit",
}));

const { config, handleProxyRequest } = await import("./proxy");

function createRequest(path: string) {
  const request = new NextRequest(`https://example.com${path}`, {
    headers: { "x-forwarded-for": "203.0.113.10" },
  }) as NextAuthRequest;
  request.auth = null;
  return request;
}

beforeEach(() => {
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 59 });
});

describe("public card browse proxy rate limiting", () => {
  it("matches both public browse routes", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/cards", "/sets"]));
  });

  it.each(["/cards", "/sets"])(
    "returns 429 with retry guidance for a limited %s request",
    async (path) => {
      rateLimitMock.mockResolvedValue({ limited: true, remaining: 0 });

      const response = await handleProxyRequest(createRequest(path));

      expect(response?.status).toBe(429);
      expect(response?.headers.get("Retry-After")).toBe("60");
      expect(rateLimitMock).toHaveBeenCalledOnce();
    }
  );

  it("marks an allowed request so the page check does not charge again", async () => {
    const response = await handleProxyRequest(createRequest("/cards"));

    expect(response?.status).toBe(200);
    expect(
      response?.headers.get(
        "x-middleware-request-x-optcg-card-browse-rate-limit"
      )
    ).toBe("allowed");
    expect(rateLimitMock).toHaveBeenCalledOnce();
  });
});
