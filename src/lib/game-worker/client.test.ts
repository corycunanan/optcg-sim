import { describe, expect, it, vi } from "vitest";
import {
  GameWorkerConfigurationError,
  gameWorkerFetch,
  isGameWorkerConfigured,
} from "./client";

describe("gameWorkerFetch", () => {
  it("builds an authenticated worker request and preserves caller headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));

    await gameWorkerFetch(
      "/game/game-1/init",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "request-1",
        },
      },
      {
        fetch: fetchMock,
        workerUrl: "https://worker.example/",
        workerSecret: "secret-123",
      }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://worker.example/game/game-1/init");
    expect(init).toMatchObject({ method: "POST" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer secret-123");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-Id")).toBe("request-1");
  });

  it("rejects missing configuration without issuing a request", async () => {
    const fetchMock = vi.fn();
    const deps = { fetch: fetchMock, workerUrl: "", workerSecret: "secret" };

    expect(isGameWorkerConfigured(deps)).toBe(false);
    await expect(gameWorkerFetch("/health", {}, deps)).rejects.toBeInstanceOf(
      GameWorkerConfigurationError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts a request when its timeout elapses", async () => {
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

      const pending = gameWorkerFetch(
        "/health",
        { timeoutMs: 25 },
        {
          fetch: fetchMock as typeof fetch,
          workerUrl: "https://worker.example",
          workerSecret: "secret",
        }
      );
      const rejection = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });

      await vi.advanceTimersByTimeAsync(25);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not install timeout resources when header validation fails", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn();
      const callerController = new AbortController();
      const addEventListener = vi.spyOn(
        callerController.signal,
        "addEventListener"
      );
      const removeEventListener = vi.spyOn(
        callerController.signal,
        "removeEventListener"
      );

      await expect(
        gameWorkerFetch(
          "/health",
          { signal: callerController.signal },
          {
            fetch: fetchMock,
            workerUrl: "https://worker.example",
            workerSecret: "bad\nsecret",
          }
        )
      ).rejects.toThrow(/invalid header value/i);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(addEventListener).not.toHaveBeenCalled();
      expect(removeEventListener).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
