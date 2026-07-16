import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const gameSessionFindFirstMock = vi.fn();
const gameSessionFindUniqueOrThrowMock = vi.fn();
const finalizeGameResultMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findFirst: (...args: unknown[]) => gameSessionFindFirstMock(...args),
      findUniqueOrThrow: (...args: unknown[]) =>
        gameSessionFindUniqueOrThrowMock(...args),
    },
  },
}));
vi.mock("@/lib/game/finalize", () => ({
  finalizeGameResult: (...args: unknown[]) => finalizeGameResultMock(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: (...args: unknown[]) => rateLimitMock(...args) },
}));
vi.mock("@/lib/realtime/fanout-game", () => ({ notifyGame: vi.fn() }));

vi.stubGlobal("fetch", fetchMock);

const { POST } = await import("./route");
const params = { params: Promise.resolve({ id: "game-1" }) };

beforeEach(() => {
  vi.stubEnv("GAME_WORKER_URL", "https://worker.example.test");
  vi.stubEnv("GAME_WORKER_SECRET", "secret");
  authMock.mockReset();
  rateLimitMock.mockReset();
  gameSessionFindFirstMock.mockReset();
  gameSessionFindUniqueOrThrowMock.mockReset();
  finalizeGameResultMock.mockReset();
  fetchMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "user-1" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 29 });
  gameSessionFindFirstMock.mockResolvedValue({
    id: "game-1",
    player1Id: "user-1",
    player2Id: "user-2",
  });
  finalizeGameResultMock.mockResolvedValue({
    finalized: true,
    alreadyFinal: false,
  });
  gameSessionFindUniqueOrThrowMock.mockResolvedValue({
    id: "game-1",
    status: "FINISHED",
    winnerId: "user-2",
    winReason: "Player conceded while disconnected",
  });
});

describe("POST /api/game/[id]", () => {
  it("keeps fallback concede successful and silently skips worker sync when misconfigured", async () => {
    vi.stubEnv("GAME_WORKER_URL", "");
    const request = new NextRequest("http://localhost/api/game/game-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONCEDE" }),
    });

    const res = await POST(request, params);

    expect(res.status).toBe(200);
    expect(finalizeGameResultMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
