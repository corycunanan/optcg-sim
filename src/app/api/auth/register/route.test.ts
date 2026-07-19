import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  authLimiter: { check: mocks.rateLimit },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));

const { POST } = await import("./route");

function buildRequest() {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "player@example.com",
      username: "player_one",
      password: "test-password-only",
    }),
  });
}

describe("POST /api/auth/register", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    mocks.rateLimit.mockReset();
    mocks.findUnique.mockReset();
    mocks.create.mockReset();
    mocks.hash.mockReset();
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterAll(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;

    if (originalNextAuthSecret === undefined)
      delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
  });

  it("returns the shared 503 before rate limiting or database work", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(buildRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication is temporarily unavailable.",
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("site=mutation-guard")
    );

    consoleError.mockRestore();
  });
});
