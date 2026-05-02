import { describe, expect, it, vi } from "vitest";
import { notifyUser } from "./fan-out";

// Use an off-vocabulary event to exercise generic runtime behavior (URL,
// auth, abort, error handling) without coupling these tests to whatever
// variants `RealtimeServerEvent` happens to carry.
const fakeEvent = { type: "test:event", payload: 1 } as unknown as never;

const baseDeps = {
  workerUrl: "https://worker.example",
  workerSecret: "secret-123",
};

describe("notifyUser", () => {
  it("POSTs to /user/:id/notify with bearer auth and JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await notifyUser("user-42", fakeEvent, { ...baseDeps, fetch: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://worker.example/user/user-42/notify");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-123",
      },
      body: JSON.stringify(fakeEvent),
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("swallows network errors and logs structured warning", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const logger = vi.fn();

    await expect(
      notifyUser("user-42", fakeEvent, { ...baseDeps, fetch: fetchMock, logger }),
    ).resolves.toBeUndefined();

    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("realtime fanout failed"),
      expect.objectContaining({
        source: "realtime.fan-out",
        targetUserId: "user-42",
        eventType: "test:event",
        error: "network down",
      }),
    );
  });

  it("swallows non-2xx responses and logs them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const logger = vi.fn();

    await expect(
      notifyUser("user-42", fakeEvent, { ...baseDeps, fetch: fetchMock, logger }),
    ).resolves.toBeUndefined();

    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("non-ok response"),
      expect.objectContaining({
        source: "realtime.fan-out",
        targetUserId: "user-42",
        eventType: "test:event",
        status: 500,
      }),
    );
  });

  it("aborts the request after the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      // Hand the test direct control of the AbortSignal: resolve only when
      // aborted, mirroring real fetch behavior on signal.abort().
      const fetchMock = vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      const logger = vi.fn();

      const pending = notifyUser("user-42", fakeEvent, {
        ...baseDeps,
        fetch: fetchMock as unknown as typeof fetch,
        logger,
      });

      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toBeUndefined();

      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining("failed"),
        expect.objectContaining({ error: "aborted" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("percent-encodes the targetUserId in the URL path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await notifyUser("user/with/slashes & spaces", fakeEvent, {
      ...baseDeps,
      fetch: fetchMock,
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://worker.example/user/user%2Fwith%2Fslashes%20%26%20spaces/notify",
    );
  });

  it("returns silently when worker URL or secret is missing", async () => {
    const fetchMock = vi.fn();
    const logger = vi.fn();

    await notifyUser("user-42", fakeEvent, {
      workerUrl: "",
      workerSecret: "secret",
      fetch: fetchMock,
      logger,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("misconfigured"),
      expect.objectContaining({ reason: "missing_worker_url_or_secret" }),
    );
  });
});
