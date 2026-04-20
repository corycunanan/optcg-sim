import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const updateMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    card: {
      update: (...args: unknown[]) => updateMock(...args),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { PATCH } = await import("./route");

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
  updateMock.mockReset();
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
});
