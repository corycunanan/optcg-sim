import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({
  auth: authMock,
}));

const { requireAdmin, requireAuth } = await import("./api-response");

beforeEach(() => {
  authMock.mockReset();
});

describe("requireAdmin", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", isAdmin: false },
    });
    const result = await requireAdmin();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns session+userId for admin", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    const result = await requireAdmin();
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.userId).toBe("admin-1");
  });
});

describe("requireAuth", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAuth();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns session+userId for any authenticated user", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", isAdmin: false },
    });
    const result = await requireAuth();
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.userId).toBe("user-1");
  });
});
