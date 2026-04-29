import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyGameToken } from "@engine/util/auth.js";

const authMock = vi.fn();
const gameSessionFindFirstMock = vi.fn();

vi.stubEnv("GAME_WORKER_SECRET", "route-secret");

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
    },
  },
}));

const { GET } = await import("./route");

function buildRequest(gameId?: string) {
  const url = gameId
    ? `http://localhost/api/game/token?gameId=${encodeURIComponent(gameId)}`
    : "http://localhost/api/game/token";
  return new NextRequest(url);
}

beforeEach(() => {
  authMock.mockReset();
  gameSessionFindFirstMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  gameSessionFindFirstMock.mockResolvedValue({ id: "game-1" });
});

describe("GET /api/game/token", () => {
  it("requires a gameId", async () => {
    const res = await GET(buildRequest());

    expect(res.status).toBe(400);
    expect(gameSessionFindFirstMock).not.toHaveBeenCalled();
  });

  it("verifies membership before minting a scoped token", async () => {
    const res = await GET(buildRequest("game-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(gameSessionFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "game-1",
        OR: [{ player1Id: "user-1" }, { player2Id: "user-1" }],
      },
      select: { id: true },
    });
    await expect(
      verifyGameToken(body.data.token, "route-secret", "game-1"),
    ).resolves.toMatchObject({
      sub: "user-1",
      gameId: "game-1",
      jti: expect.any(String),
    });
  });

  it("rejects non-participants", async () => {
    gameSessionFindFirstMock.mockResolvedValue(null);

    const res = await GET(buildRequest("game-1"));

    expect(res.status).toBe(404);
  });
});
