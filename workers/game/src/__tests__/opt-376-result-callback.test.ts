import { beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "../lib/log.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { createResultCallbackFetch } from "../session/result-callback.js";
import type { GameState } from "../types.js";
import { setupGame } from "./helpers.js";

const storage = {} as SessionStorage;

function terminalState(): GameState {
  const { state } = setupGame();
  return {
    ...state,
    status: "FINISHED",
    winner: 0,
    winReason: "Leader KO",
  };
}

function repositoryWith(fetchResult: typeof fetch) {
  return new SessionRepository(
    storage,
    { nextJsUrl: "https://app.example.test", workerSecret: "secret" },
    fetchResult
  );
}

beforeEach(() => {
  vi.mocked(log).mockClear();
});

describe("writeResultToDb callback retries", () => {
  it("retries a transient response and succeeds on the next attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith(
      createResultCallbackFetch({
        fetch: fetchMock,
        wait,
      })
    );

    await expect(
      repository.writeResult(terminalState())
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
    expect(log).not.toHaveBeenCalledWith(
      "game.result_write_failed",
      expect.anything()
    );
  });

  it("contains retry exhaustion and emits a structured failure event", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const wait = vi.fn().mockResolvedValue(undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const repository = repositoryWith(
      createResultCallbackFetch({
        fetch: fetchMock,
        wait,
      })
    );

    await expect(
      repository.writeResult(terminalState())
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[250], [500]]);
    expect(log).toHaveBeenCalledWith("game.result_write_failed", {
      source: "GameSession.writeResultToDb",
      gameId: "test-game-001",
      attempts: 3,
      status: 503,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[GameSession] writeResultToDb HTTP",
      503,
      "unavailable"
    );
  });

  it("times out each hung attempt and remains non-fatal after exhaustion", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          })
      );
      const wait = vi.fn().mockResolvedValue(undefined);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const repository = repositoryWith(
        createResultCallbackFetch({
          fetch: fetchMock as typeof fetch,
          wait,
          timeoutMs: 25,
          maxAttempts: 2,
        })
      );

      const pending = repository.writeResult(terminalState());
      await vi.advanceTimersByTimeAsync(25);
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith("game.result_write_failed", {
        source: "GameSession.writeResultToDb",
        gameId: "test-game-001",
        attempts: 2,
        error: "aborted",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[GameSession] writeResultToDb fetch failed:",
        "https://app.example.test/api/game/result",
        expect.objectContaining({ name: "AbortError" })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
