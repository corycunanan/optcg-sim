import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyUserToken } from "@engine/util/auth.js";

const authMock = vi.fn();
const rateLimitMock = vi.fn();

vi.stubEnv("GAME_WORKER_SECRET", "realtime-test-secret");

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { POST } = await import("./route");

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 30 });
});

describe("POST /api/realtime/token", () => {
  it("mints a verifiable user-channel token for the authed caller", async () => {
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      token: expect.any(String),
      expiresAt: expect.any(Number),
    });

    const payload = await verifyUserToken(body.data.token, "realtime-test-secret");
    expect(payload).toMatchObject({
      sub: "user-1",
      jti: expect.any(String),
    });
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns 401 when no session is present", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
  });

  it("returns 429 when the rate limiter rejects the caller", async () => {
    rateLimitMock.mockResolvedValue({ limited: true, remaining: 0 });

    const res = await POST();

    expect(res.status).toBe(429);
  });

  it("scopes rate-limit identifier per user", async () => {
    await POST();

    expect(rateLimitMock).toHaveBeenCalledWith("realtime-token:user-1");
  });
});
