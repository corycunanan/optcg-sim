import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const gameSessionFindManyMock = vi.fn();
const finalizeGameResultMock = vi.fn();
const notifyRestoredLobbyMock = vi.fn();
const notifyGameMock = vi.fn();
const gameWorkerFetchMock = vi.fn();

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    gameSession: {
      findMany: (...args: unknown[]) => gameSessionFindManyMock(...args),
    },
  },
}));
vi.mock("@/lib/game/finalize", () => ({
  finalizeGameResult: (...args: unknown[]) => finalizeGameResultMock(...args),
  notifyRestoredLobby: (...args: unknown[]) => notifyRestoredLobbyMock(...args),
}));
vi.mock("@/lib/game-worker/client", () => ({
  gameWorkerFetch: (...args: unknown[]) => gameWorkerFetchMock(...args),
}));
vi.mock("@/lib/realtime/fanout-game", () => ({
  notifyGame: (...args: unknown[]) => notifyGameMock(...args),
}));

vi.stubEnv("CRON_SECRET", "test-cron-secret");

const { GET } = await import("./route");

const NOW = new Date("2026-07-24T18:00:00.000Z");
const CUTOFF = new Date("2026-07-23T18:00:00.000Z");

function buildRequest(auth: string | null = "Bearer test-cron-secret") {
  const headers = new Headers();
  if (auth !== null) headers.set("authorization", auth);
  return new NextRequest("http://localhost/api/cron/game-finalization-repair", {
    headers,
  });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  gameSessionFindManyMock.mockReset();
  finalizeGameResultMock.mockReset();
  notifyRestoredLobbyMock.mockReset();
  notifyGameMock.mockReset();
  gameWorkerFetchMock.mockReset();
  gameSessionFindManyMock.mockResolvedValue([]);
  finalizeGameResultMock.mockResolvedValue({
    finalized: true,
    alreadyFinal: false,
    restoredLobbyId: "lobby-1",
  });
  notifyRestoredLobbyMock.mockResolvedValue(undefined);
  notifyGameMock.mockResolvedValue(undefined);
  gameWorkerFetchMock.mockImplementation(async () =>
    Response.json({ status: "ABSENT" }, { status: 404 })
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/game-finalization-repair", () => {
  it.each([null, "Bearer wrong"])(
    "rejects an unauthorized request with header %s",
    async (auth) => {
      const response = await GET(buildRequest(auth));

      expect(response.status).toBe(401);
      expect(gameSessionFindManyMock).not.toHaveBeenCalled();
    }
  );

  it("fails closed when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(gameSessionFindManyMock).not.toHaveBeenCalled();
  });

  it("finalizes a worker-absent stale session and fans out", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([{ id: "game-1" }]);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(gameSessionFindManyMock).toHaveBeenCalledWith({
      where: {
        status: "IN_PROGRESS",
        startedAt: { lt: CUTOFF },
        lobby: { status: "IN_GAME" },
      },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      take: 20,
      select: { id: true },
    });
    expect(gameWorkerFetchMock).toHaveBeenCalledWith("/game/game-1/status", {
      method: "GET",
      timeoutMs: 1_500,
    });
    expect(finalizeGameResultMock).toHaveBeenCalledWith({
      gameId: "game-1",
      status: "ABANDONED",
      winnerId: null,
      winReason:
        "Game worker session absent after the 24-hour recovery threshold",
    });
    expect(notifyGameMock).toHaveBeenCalledWith("game-1", {
      status: "ABANDONED",
      winnerId: null,
      winReason:
        "Game worker session absent after the 24-hour recovery threshold",
    });
    expect(notifyRestoredLobbyMock).toHaveBeenCalledWith("lobby-1");
    expect(body).toEqual({
      success: true,
      cutoff: CUTOFF.toISOString(),
      selected: 1,
      finalized: 1,
      alreadyFinal: 0,
      skippedLive: 0,
      skippedUnreachable: 0,
      errors: 0,
      durationMs: 0,
    });
    expect(response.status).toBe(200);
    infoSpy.mockRestore();
  });

  it("skips a genuinely live worker session", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([{ id: "game-live" }]);
    gameWorkerFetchMock.mockResolvedValueOnce(
      Response.json({
        status: "IN_PROGRESS",
        winnerId: null,
        winReason: null,
      })
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      selected: 1,
      finalized: 0,
      skippedLive: 1,
      skippedUnreachable: 0,
      errors: 0,
    });
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
    expect(notifyGameMock).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("finalizes the authoritative terminal worker result", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([{ id: "game-terminal" }]);
    gameWorkerFetchMock.mockResolvedValueOnce(
      Response.json({
        status: "FINISHED",
        winnerId: "user-2",
        winReason: "Leader KO",
      })
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(finalizeGameResultMock).toHaveBeenCalledWith({
      gameId: "game-terminal",
      status: "FINISHED",
      winnerId: "user-2",
      winReason: "Leader KO",
    });
    expect(notifyGameMock).toHaveBeenCalledWith("game-terminal", {
      status: "FINISHED",
      winnerId: "user-2",
      winReason: "Leader KO",
    });
    infoSpy.mockRestore();
  });

  it("skips and reports a session when the worker is unreachable", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([{ id: "game-unreachable" }]);
    gameWorkerFetchMock.mockRejectedValueOnce(
      new DOMException("timed out", "AbortError")
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      selected: 1,
      finalized: 0,
      skippedLive: 0,
      skippedUnreachable: 1,
      errors: 0,
    });
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "game_finalization_repair_worker_unreachable",
        gameId: "game-unreachable",
        reason: "AbortError",
      })
    );
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("does not treat an unrecognized 404 as an absent session", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([{ id: "game-old-worker" }]);
    gameWorkerFetchMock.mockResolvedValueOnce(
      new Response("Not found", { status: 404 })
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skippedUnreachable).toBe(1);
    expect(finalizeGameResultMock).not.toHaveBeenCalled();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("treats a concurrent terminal callback as an idempotent repair", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([{ id: "game-1" }]);
    finalizeGameResultMock.mockResolvedValueOnce({
      finalized: false,
      alreadyFinal: true,
      restoredLobbyId: null,
    });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      selected: 1,
      finalized: 0,
      alreadyFinal: 1,
      skippedLive: 0,
      skippedUnreachable: 0,
      errors: 0,
    });
    expect(notifyGameMock).not.toHaveBeenCalled();
    expect(notifyRestoredLobbyMock).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("continues the bounded batch and reports individual repair failures", async () => {
    gameSessionFindManyMock.mockResolvedValueOnce([
      { id: "game-1" },
      { id: "game-2" },
    ]);
    finalizeGameResultMock
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({
        finalized: true,
        alreadyFinal: false,
        restoredLobbyId: "lobby-2",
      });
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      selected: 2,
      finalized: 1,
      alreadyFinal: 0,
      skippedLive: 0,
      skippedUnreachable: 0,
      errors: 1,
    });
    expect(finalizeGameResultMock).toHaveBeenCalledTimes(2);
    expect(notifyRestoredLobbyMock).toHaveBeenCalledWith("lobby-2");
    expect(JSON.stringify(body)).not.toContain("database unavailable");
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reports a candidate-query failure without exposing its message", async () => {
    gameSessionFindManyMock.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      cutoff: CUTOFF.toISOString(),
      selected: 0,
      finalized: 0,
      alreadyFinal: 0,
      skippedLive: 0,
      skippedUnreachable: 0,
      errors: 1,
      durationMs: 0,
    });
    expect(JSON.stringify(body)).not.toContain("database unavailable");
    errorSpy.mockRestore();
  });
});
