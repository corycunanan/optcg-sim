import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthRequest } from "next-auth";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  hasAuthSecret: true,
  logAuthConfigurationDegraded: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("@/lib/auth-configuration", () => ({
  logAuthConfigurationDegraded: mocks.logAuthConfigurationDegraded,
}));

vi.mock("@/auth", () => ({
  auth: (handler: unknown) => handler,
  hasAuthSecret: () => mocks.hasAuthSecret,
}));
vi.mock("@/lib/cards/public-rate-limit", () => ({
  consumePublicCardBrowseRateLimit: mocks.rateLimit,
  PUBLIC_CARD_BROWSE_RATE_LIMIT_HEADER: "x-optcg-card-browse-rate-limit",
}));

const { config, default: proxy, handleProxyRequest } = await import("./proxy");

function createRequest(path: string) {
  const request = new NextRequest(`https://example.com${path}`, {
    headers: { "x-forwarded-for": "203.0.113.10" },
  }) as NextAuthRequest;
  request.auth = null;
  return request;
}

beforeEach(() => {
  mocks.hasAuthSecret = true;
  mocks.rateLimit.mockReset();
  mocks.logAuthConfigurationDegraded.mockReset();
  mocks.rateLimit.mockResolvedValue({ limited: false, remaining: 59 });
});

describe("missing Auth.js secret", () => {
  it("fails closed instead of trusting Auth.js configuration-error JSON", async () => {
    mocks.hasAuthSecret = false;
    const request = createRequest("/admin");
    request.auth = { message: "server configuration" } as never;

    const response = await proxy(request, {} as never);

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe(
      "https://example.com/login?callbackUrl=%2Fadmin"
    );
    expect(mocks.logAuthConfigurationDegraded).toHaveBeenCalledWith("proxy");
  });
});

describe("public card browse proxy rate limiting", () => {
  it("matches both public browse routes", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/cards", "/sets"]));
  });

  it.each(["/cards", "/sets"])(
    "returns 429 with retry guidance for a limited %s request",
    async (path) => {
      mocks.rateLimit.mockResolvedValue({ limited: true, remaining: 0 });

      const response = await handleProxyRequest(createRequest(path));

      expect(response?.status).toBe(429);
      expect(response?.headers.get("Retry-After")).toBe("60");
      expect(mocks.rateLimit).toHaveBeenCalledOnce();
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
    expect(mocks.rateLimit).toHaveBeenCalledOnce();
  });
});
