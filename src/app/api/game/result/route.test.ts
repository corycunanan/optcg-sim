import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const finalizeGameResultMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 29 }));
const notifyGameMock = vi.fn();

// Track `after()` callbacks so tests can deterministically wait for them
// before asserting on fanout side effects (mirrors the lobbies route tests).
const afterCalls = vi.hoisted(() => ({
  pending: [] as Promise<void>[],
}));

async function flushAfter(): Promise<void> {
  while (afterCalls.pending.length) {
    const batch = afterCalls.pending.splice(0);
    await Promise.all(batch);
  }
}

vi.mock("next/server", async (importActual) => {
  const actual = await importActual<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => {
      afterCalls.pending.push(Promise.resolve().then(cb));
    },
  };
});

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/game/finalize", () => ({
  finalizeGameResult: (...args: unknown[]) => finalizeGameResultMock(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));
vi.mock("@/lib/realtime/fanout-game", () => ({
  notifyGame: (...args: unknown[]) => notifyGameMock(...args),
}));

const SECRET = "test-secret";
vi.stubEnv("GAME_WORKER_SECRET", SECRET);

const { POST } = await import("./route");

const validBody = {
  gameId: "game-1",
  status: "FINISHED",
  winnerId: "user-1",
  winReason: "Life-out",
  reasonCode: "LIFE_LOSS",
};

function buildRequest(opts: { auth?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== null) {
    headers.Authorization = opts.auth ?? `Bearer ${SECRET}`;
  }
  return new NextRequest("http://localhost/api/game/result", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? validBody),
  });
}

beforeEach(() => {
  finalizeGameResultMock.mockReset();
  finalizeGameResultMock.mockResolvedValue({ finalized: true, alreadyFinal: false });
  rateLimitMock.mockReset();
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 29 });
  notifyGameMock.mockReset();
  notifyGameMock.mockResolvedValue(undefined);
  afterCalls.pending.length = 0;
});

describe("POST /api/game/result", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(buildRequest({ auth: "" }));
    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Bearer token does not match", async () => {
    const res = await POST(buildRequest({ auth: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded, keyed by gameId", async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0 });
    const res = await POST(buildRequest());
    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith("game-result:game-1");
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("finalizes the game session and returns success on happy path", async () => {
    const res = await POST(buildRequest());
    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("game-result:game-1");
    expect(finalizeGameResultMock).toHaveBeenCalledWith({
      gameId: "game-1",
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Life-out",
      reasonCode: "LIFE_LOSS",
    });
  });

  it("rejects non-terminal result payloads", async () => {
    const res = await POST(buildRequest({ body: { ...validBody, status: "IN_PROGRESS" } }));
    expect(res.status).toBe(400);
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the DB update throws", async () => {
    finalizeGameResultMock.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(buildRequest());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("fans out game:status to both players after a successful finalize", async () => {
    const res = await POST(buildRequest());
    await flushAfter();

    expect(res.status).toBe(200);
    expect(notifyGameMock).toHaveBeenCalledTimes(1);
    expect(notifyGameMock).toHaveBeenCalledWith("game-1", {
      status: "FINISHED",
      winnerId: "user-1",
      winReason: "Life-out",
    });
  });

  it("does not fan out when the row was already terminal (idempotent re-call)", async () => {
    finalizeGameResultMock.mockResolvedValueOnce({
      finalized: false,
      alreadyFinal: true,
    });

    const res = await POST(buildRequest());
    await flushAfter();

    expect(res.status).toBe(200);
    expect(notifyGameMock).not.toHaveBeenCalled();
  });
});
