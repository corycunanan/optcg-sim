import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: undefined as Record<string, unknown> | undefined,
  auth: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  findUnique: vi.fn(),
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
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

import { auth, authConfig, handlers, hasAuthSecret } from "@/auth";

describe("Auth.js server configuration", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.findUnique.mockReset();
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
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(auth()).resolves.toBeNull();
    await expect(auth()).resolves.toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        "[AUTH_CONFIG] AUTH_SECRET missing — auth degraded to signed-out (site=session-read)"
      )
    );

    consoleError.mockRestore();
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
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
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
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("site=mutation-guard")
    );

    consoleError.mockRestore();
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

  it("refreshes the authoritative theme in the existing JWT DB lookup", async () => {
    mocks.findUnique.mockResolvedValue({
      isAdmin: false,
      theme: "default",
    });
    const jwtCallback = authConfig.callbacks?.jwt as unknown as (args: {
      token: Record<string, unknown>;
      user?: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    const sessionCallback = authConfig.callbacks?.session as unknown as (args: {
      session: { user: Record<string, unknown> };
      token: Record<string, unknown>;
    }) => Promise<{ user: Record<string, unknown> }>;

    const token = await jwtCallback({ token: { sub: "user-1" } });
    const session = await sessionCallback({ session: { user: {} }, token });

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { isAdmin: true, theme: true },
    });
    expect(token.theme).toBe("default");
    expect(session.user.theme).toBe("default");
  });
});
