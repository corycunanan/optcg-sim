import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, THEME_COOKIE_NAME } from "@/lib/theme";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const { GET, PUT } = await import("./route");

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost/api/user/theme", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "user-1" } });
});

describe("/api/user/theme", () => {
  it("requires authentication", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("hydrates this device's cookie from the authoritative DB setting", async () => {
    findUniqueMock.mockResolvedValue({ theme: DEFAULT_THEME });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { theme: DEFAULT_THEME },
    });
    expect(response.cookies.get(THEME_COOKIE_NAME)?.value).toBe(DEFAULT_THEME);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { theme: true },
    });
  });

  it("updates the DB before mirroring the selected theme cookie", async () => {
    updateMock.mockResolvedValue({ theme: DEFAULT_THEME });

    const response = await PUT(buildRequest({ theme: DEFAULT_THEME }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { theme: DEFAULT_THEME },
      select: { theme: true },
    });
    expect(response.cookies.get(THEME_COOKIE_NAME)?.value).toBe(DEFAULT_THEME);
  });

  it("rejects unregistered themes without writing", async () => {
    const response = await PUT(buildRequest({ theme: "throwaway" }));

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(response.cookies.get(THEME_COOKIE_NAME)).toBeUndefined();
  });

  it("returns 404 when the authenticated user row no longer exists", async () => {
    updateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "6.19.2",
      })
    );

    const response = await PUT(buildRequest({ theme: DEFAULT_THEME }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "User not found",
    });
    expect(response.cookies.get(THEME_COOKIE_NAME)).toBeUndefined();
  });
});
