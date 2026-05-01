import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const gameSessionFindFirstMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
    },
  },
}));

const { GET } = await import("./route");

const params = { params: Promise.resolve({ id: "game-1" }) };

beforeEach(() => {
  authMock.mockReset();
  gameSessionFindFirstMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  gameSessionFindFirstMock.mockResolvedValue({
    id: "game-1",
    mode: "SOLITAIRE",
    status: "IN_PROGRESS",
    winnerId: null,
    winReason: null,
    player1Id: "user-1",
    player2Id: "user-1",
  });
});

describe("GET /api/game/[id]", () => {
  it("returns the game mode so the board can choose its session hook", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/game/game-1"),
      params
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(gameSessionFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "game-1",
        OR: [{ player1Id: "user-1" }, { player2Id: "user-1" }],
      },
      select: {
        id: true,
        mode: true,
        status: true,
        winnerId: true,
        winReason: true,
        player1Id: true,
        player2Id: true,
      },
    });
    expect(body.data).toMatchObject({
      id: "game-1",
      mode: "SOLITAIRE",
      status: "IN_PROGRESS",
      playerIndex: 0,
      canFallbackConcede: true,
    });
  });
});
