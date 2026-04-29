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

function buildRequest(gameId?: string, playerIndex?: string) {
  const params = new URLSearchParams();
  if (gameId) params.set("gameId", gameId);
  if (playerIndex) params.set("playerIndex", playerIndex);
  const query = params.toString();
  const url = query
    ? `http://localhost/api/game/token?${query}`
    : "http://localhost/api/game/token";
  return new NextRequest(url);
}

beforeEach(() => {
  authMock.mockReset();
  gameSessionFindFirstMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  gameSessionFindFirstMock.mockResolvedValue({
    id: "game-1",
    mode: "PVP",
    player1Id: "user-1",
    player2Id: "user-2",
  });
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
      select: {
        id: true,
        mode: true,
        player1Id: true,
        player2Id: true,
      },
    });
    await expect(
      verifyGameToken(body.data.token, "route-secret", "game-1"),
    ).resolves.toMatchObject({
      sub: "user-1",
      gameId: "game-1",
      jti: expect.any(String),
    });
  });

  it("adds a playerIndex claim for same-user Solitaire games", async () => {
    gameSessionFindFirstMock.mockResolvedValue({
      id: "game-1",
      mode: "SOLITAIRE",
      player1Id: "user-1",
      player2Id: "user-1",
    });

    const res = await GET(buildRequest("game-1", "1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    await expect(
      verifyGameToken(body.data.token, "route-secret", "game-1"),
    ).resolves.toMatchObject({
      sub: "user-1",
      gameId: "game-1",
      playerIndex: 1,
    });
  });

  it("silently ignores playerIndex for PVP games", async () => {
    const res = await GET(buildRequest("game-1", "1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    const payload = await verifyGameToken(body.data.token, "route-secret", "game-1");
    expect(payload).not.toHaveProperty("playerIndex");
  });

  it("rejects malformed playerIndex values", async () => {
    const res = await GET(buildRequest("game-1", "2"));

    expect(res.status).toBe(400);
    expect(gameSessionFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects non-participants", async () => {
    gameSessionFindFirstMock.mockResolvedValue(null);

    const res = await GET(buildRequest("game-1"));

    expect(res.status).toBe(404);
  });
});
