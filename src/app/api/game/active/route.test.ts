import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const gameSessionFindFirstMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  searchLimiter: { check: rateLimitMock },
}));

const { GET } = await import("./route");

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  gameSessionFindFirstMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  gameSessionFindFirstMock.mockResolvedValue({ id: "game-1" });
});

describe("GET /api/game/active", () => {
  it("only returns active PVP games for the lobby rejoin surface", async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { id: "game-1" } });
    expect(gameSessionFindFirstMock).toHaveBeenCalledWith({
      where: {
        mode: "PVP",
        status: "IN_PROGRESS",
        OR: [{ player1Id: "user-1" }, { player2Id: "user-1" }],
      },
      select: { id: true },
      orderBy: { startedAt: "desc" },
    });
  });
});
