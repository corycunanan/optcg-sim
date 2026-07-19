import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: undefined as Record<string, unknown> | undefined,
  auth: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: Record<string, unknown>) => {
    mocks.config = config;
    return {
      auth: mocks.auth,
      handlers: { GET: mocks.get, POST: mocks.post },
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(() => ({})),
}));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

import { auth, authConfig, handlers, hasAuthSecret } from "@/auth";

describe("Auth.js server configuration", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.get.mockReset();
    mocks.post.mockReset();
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

  it("explicitly trusts Vercel preview forwarded hosts", () => {
    expect(authConfig.trustHost).toBe(true);
    expect(mocks.config?.trustHost).toBe(true);
  });

  it("treats a missing secret as signed out for server components", async () => {
    await expect(auth()).resolves.toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("returns a signed-out client session when the secret is missing", async () => {
    const response = await handlers.GET(
      new NextRequest("https://preview.vercel.app/api/auth/session")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns a service error for auth actions when the secret is missing", async () => {
    const response = await handlers.POST(
      new NextRequest("https://preview.vercel.app/api/auth/signin/google", {
        method: "POST",
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: "Authentication is temporarily unavailable.",
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("delegates to Auth.js when a secret is configured", async () => {
    process.env.AUTH_SECRET = "configured-for-test-only";
    const session = { user: { id: "user-1" } };
    mocks.auth.mockResolvedValue(session);
    mocks.get.mockResolvedValue(Response.json(session));

    expect(hasAuthSecret()).toBe(true);
    await expect(auth()).resolves.toBe(session);
    const response = await handlers.GET(
      new NextRequest("https://preview.vercel.app/api/auth/session")
    );
    await expect(response.json()).resolves.toEqual(session);
  });
});
