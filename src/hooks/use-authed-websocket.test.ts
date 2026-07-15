import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeReconnectDelay,
  createAuthedWebSocketController,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  shouldHandleClose,
} from "./use-authed-websocket";
import type { ConnectionStatus } from "@/types/realtime";

/* ── Mock WebSocket ──────────────────────────────────────────────── */

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = 0; // CONNECTING
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  // Test helpers
  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  simulateClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
}

/* ── Test harness ─────────────────────────────────────────────────── */

interface Harness {
  statuses: ConnectionStatus[];
  errors: Array<string | null>;
  messages: unknown[];
  scheduledDelays: number[];
  fakeNow: number;
}

function makeController(opts: {
  url?: string | null;
  getToken?: () => Promise<string>;
  harness?: Harness;
}) {
  const harness: Harness = opts.harness ?? {
    statuses: [],
    errors: [],
    messages: [],
    scheduledDelays: [],
    fakeNow: 0,
  };
  const getToken = opts.getToken ?? vi.fn().mockResolvedValue("tok-1");

  let nextTimerId = 1;
  const timers = new Map<number, { fn: () => void; fireAt: number }>();

  const setTimeoutFn = (fn: () => void, ms: number): unknown => {
    const id = nextTimerId++;
    timers.set(id, { fn, fireAt: harness.fakeNow + ms });
    harness.scheduledDelays.push(ms);
    return id;
  };
  const clearTimeoutFn = (id: unknown) => {
    timers.delete(id as number);
  };
  const advanceTimers = async (ms: number) => {
    const target = harness.fakeNow + ms;
    while (true) {
      let nextId: number | null = null;
      let nextFireAt = Infinity;
      for (const [id, t] of timers) {
        if (t.fireAt <= target && t.fireAt < nextFireAt) {
          nextId = id;
          nextFireAt = t.fireAt;
        }
      }
      if (nextId === null) break;
      const t = timers.get(nextId)!;
      timers.delete(nextId);
      harness.fakeNow = t.fireAt;
      t.fn();
      // Flush any microtasks queued by the timer callback.
      await Promise.resolve();
      await Promise.resolve();
    }
    harness.fakeNow = target;
  };

  const url: string | null =
    opts.url === undefined ? "https://worker.example/game/g1/ws" : opts.url;

  const controller = createAuthedWebSocketController<unknown>({
    url,
    getToken,
    onMessage: (msg) => harness.messages.push(msg),
    onStatusChange: (status) => harness.statuses.push(status),
    onErrorChange: (err) => harness.errors.push(err),
    WebSocketCtor: FakeWebSocket as unknown as new (url: string) => never as never,
    setTimeoutFn,
    clearTimeoutFn,
  });

  return { controller, harness, getToken: getToken as ReturnType<typeof vi.fn>, advanceTimers };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ── Pure helpers ─────────────────────────────────────────────────── */

describe("computeReconnectDelay", () => {
  it("doubles each attempt up to RECONNECT_MAX_MS", () => {
    expect(computeReconnectDelay(0)).toBe(RECONNECT_BASE_MS); // 1000
    expect(computeReconnectDelay(1)).toBe(2000);
    expect(computeReconnectDelay(2)).toBe(4000);
    expect(computeReconnectDelay(3)).toBe(8000);
    expect(computeReconnectDelay(4)).toBe(16000);
    expect(computeReconnectDelay(5)).toBe(RECONNECT_MAX_MS); // 32000 capped to 30000
    expect(computeReconnectDelay(10)).toBe(RECONNECT_MAX_MS);
  });

  it("matches the documented schedule [1, 2, 4, 8, 16, 30] for attempts 0..5", () => {
    const ms = [0, 1, 2, 3, 4, 5].map(computeReconnectDelay);
    expect(ms).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
  });
});

describe("shouldHandleClose", () => {
  const ws = { id: "live" };
  it("returns true for the live socket when not stopped or manually closed", () => {
    expect(
      shouldHandleClose({ ws, liveWs: ws, stopped: false, manuallyClosed: false }),
    ).toBe(true);
  });
  it("returns false for an orphan socket (the OPT-350 invariant)", () => {
    expect(
      shouldHandleClose({
        ws,
        liveWs: { id: "newer" },
        stopped: false,
        manuallyClosed: false,
      }),
    ).toBe(false);
  });
  it("returns false when stopped (post-unmount)", () => {
    expect(
      shouldHandleClose({ ws, liveWs: ws, stopped: true, manuallyClosed: false }),
    ).toBe(false);
  });
  it("returns false on manual close (leaveGame / explicit close)", () => {
    expect(
      shouldHandleClose({ ws, liveWs: ws, stopped: false, manuallyClosed: true }),
    ).toBe(false);
  });
});

/* ── Controller behavioral tests ──────────────────────────────────── */

describe("createAuthedWebSocketController", () => {
  it("does not connect when url is null", async () => {
    const { controller, harness } = makeController({ url: null });
    controller.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(harness.statuses).toEqual([]);
  });

  it("fetches a fresh token on every connect attempt", async () => {
    const getToken = vi.fn().mockResolvedValue("tok-1");
    const { controller, advanceTimers } = makeController({ getToken });
    controller.start();
    // Wait for first getToken().then chain to resolve and WebSocket to be constructed.
    await Promise.resolve();
    await Promise.resolve();
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);

    // Open then drop the socket → reconnect after 1s.
    FakeWebSocket.instances[0]!.simulateOpen();
    FakeWebSocket.instances[0]!.simulateClose();
    await advanceTimers(RECONNECT_BASE_MS);

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("schedules reconnects on the documented backoff schedule", async () => {
    const { controller, harness, advanceTimers } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    // Drop socket repeatedly without ever opening (so attempts keep growing).
    // After each drop: advance the scheduled delay so the next connect runs.
    const expectedDelays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < expectedDelays.length; i++) {
      const ws = FakeWebSocket.instances[i]!;
      ws.simulateClose();
      await advanceTimers(expectedDelays[i]!);
    }

    expect(harness.scheduledDelays).toEqual(expectedDelays);
    expect(FakeWebSocket.instances).toHaveLength(expectedDelays.length + 1);
  });

  it("surfaces 'failed' after MAX_RECONNECT_ATTEMPTS consecutive drops", async () => {
    const { controller, harness, advanceTimers } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    // Drop and reconnect MAX times; the (MAX+1)th close should surface "failed"
    // instead of scheduling another retry.
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      const ws = FakeWebSocket.instances[i]!;
      ws.simulateClose();
      await advanceTimers(computeReconnectDelay(i));
    }
    // One more close — attempts === MAX_RECONNECT_ATTEMPTS now, so we give up.
    const lastWs = FakeWebSocket.instances[MAX_RECONNECT_ATTEMPTS]!;
    lastWs.simulateClose();
    await Promise.resolve();

    expect(harness.statuses[harness.statuses.length - 1]).toBe("failed");
  });

  it("retry() invalidates a pending connect — only the latest attempt installs a socket", async () => {
    // Two parallel connect() calls: start() → A, then retry() → B. With the
    // generation guard, whichever resolves last aborts in its post-await
    // check; only the latest attempt installs its socket. (Without the guard,
    // a slow-A / fast-B order would let A overwrite ws with a stale socket.)
    let resolveTokenA: (t: string) => void = () => {};
    let resolveTokenB: (t: string) => void = () => {};
    const tokenAPromise = new Promise<string>((r) => {
      resolveTokenA = r;
    });
    const tokenBPromise = new Promise<string>((r) => {
      resolveTokenB = r;
    });
    const getToken = vi
      .fn()
      .mockReturnValueOnce(tokenAPromise)
      .mockReturnValueOnce(tokenBPromise);

    const { controller } = makeController({ getToken });
    controller.start();
    await Promise.resolve(); // A awaiting

    controller.retry();
    await Promise.resolve(); // B awaiting

    // Resolve B first (the intended winner).
    resolveTokenB("tok-b");
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toContain("token=tok-b");

    // Resolve A second. The generation guard must abort A's post-await path;
    // ws must NOT be overwritten with a stale socket.
    resolveTokenA("tok-a");
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toContain("token=tok-b");
  });

  it("retry() invalidates pending connect even when the older fetch resolves first", async () => {
    // Mirror of the above with A-then-B resolution order. A still aborts
    // because by the time A resolves, retry() has already bumped the
    // generation. Without the guard, A would install socketA and B would
    // install socketB on top — leaving socketA as an orphan with onclose
    // attached (the original OPT-350 supersede shape).
    let resolveTokenA: (t: string) => void = () => {};
    let resolveTokenB: (t: string) => void = () => {};
    const tokenAPromise = new Promise<string>((r) => {
      resolveTokenA = r;
    });
    const tokenBPromise = new Promise<string>((r) => {
      resolveTokenB = r;
    });
    const getToken = vi
      .fn()
      .mockReturnValueOnce(tokenAPromise)
      .mockReturnValueOnce(tokenBPromise);

    const { controller } = makeController({ getToken });
    controller.start();
    await Promise.resolve();

    controller.retry();
    await Promise.resolve();

    resolveTokenA("tok-a");
    await Promise.resolve();
    await Promise.resolve();
    // A aborted → no socket yet.
    expect(FakeWebSocket.instances).toHaveLength(0);

    resolveTokenB("tok-b");
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toContain("token=tok-b");
  });

  it("close() during a pending connect prevents the socket from opening afterward", async () => {
    let resolveToken: (t: string) => void = () => {};
    const tokenPromise = new Promise<string>((r) => {
      resolveToken = r;
    });
    const getToken = vi.fn().mockReturnValueOnce(tokenPromise);

    const { controller, harness } = makeController({ getToken });
    controller.start();
    await Promise.resolve(); // connect awaiting token

    await controller.close();
    expect(harness.statuses[harness.statuses.length - 1]).toBe("disconnected");
    expect(FakeWebSocket.instances).toHaveLength(0);

    // Resolve the token AFTER close. Without the generation guard, the pending
    // connect() would happily construct a socket here.
    resolveToken("tok-late");
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(harness.statuses[harness.statuses.length - 1]).toBe("disconnected");
  });

  it("dispose() during a pending connect prevents the socket from opening afterward", async () => {
    let resolveToken: (t: string) => void = () => {};
    const tokenPromise = new Promise<string>((r) => {
      resolveToken = r;
    });
    const getToken = vi.fn().mockReturnValueOnce(tokenPromise);

    const { controller } = makeController({ getToken });
    controller.start();
    await Promise.resolve();

    controller.dispose();
    expect(FakeWebSocket.instances).toHaveLength(0);

    resolveToken("tok-late");
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("retry() resets attempts and reconnects after 'failed'", async () => {
    const { controller, harness, advanceTimers } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    // Drive into 'failed'.
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      FakeWebSocket.instances[i]!.simulateClose();
      await advanceTimers(computeReconnectDelay(i));
    }
    FakeWebSocket.instances[MAX_RECONNECT_ATTEMPTS]!.simulateClose();
    await Promise.resolve();
    expect(harness.statuses[harness.statuses.length - 1]).toBe("failed");

    const wsCountBefore = FakeWebSocket.instances.length;
    controller.retry();
    await Promise.resolve();
    await Promise.resolve();

    // retry() opens a new socket immediately (no setTimeout).
    expect(FakeWebSocket.instances.length).toBe(wsCountBefore + 1);
    // Status transitions through "connecting".
    expect(harness.statuses).toContain("connecting");

    // After retry(), one drop should schedule a 1s delay (attempts reset to 0).
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!.simulateClose();
    expect(harness.scheduledDelays[harness.scheduledDelays.length - 1]).toBe(
      RECONNECT_BASE_MS,
    );
  });

  it("close() suppresses reconnect", async () => {
    const { controller, harness, advanceTimers } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    expect(harness.statuses).toContain("connected");

    await controller.close();
    expect(ws.close).toHaveBeenCalled();
    expect(harness.statuses[harness.statuses.length - 1]).toBe("disconnected");

    // Even if the old onclose somehow fires after close(), no reconnect.
    const scheduledCountBefore = harness.scheduledDelays.length;
    // Advance well past the longest possible backoff window.
    await advanceTimers(RECONNECT_MAX_MS * 2);
    expect(harness.scheduledDelays.length).toBe(scheduledCountBefore);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("send() reports 'Not connected' before the socket opens", async () => {
    const { controller, harness } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    // Socket is constructed but not yet open.
    controller.send({ ping: 1 });
    expect(harness.errors[harness.errors.length - 1]).toBe("Not connected");
  });

  it("send() forwards JSON-encoded payloads when open and clears errors", async () => {
    const { controller, harness } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    controller.send({ type: "game:action", action: { kind: "END_TURN" } });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "game:action", action: { kind: "END_TURN" } }),
    );
    expect(harness.errors[harness.errors.length - 1]).toBeNull();
  });

  it("parses incoming JSON and forwards to onMessage", async () => {
    const { controller, harness } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: "hello", value: 42 });

    expect(harness.messages).toEqual([{ type: "hello", value: 42 }]);
  });

  it("appends ?token= when url has no query, &token= when it does", async () => {
    {
      const { controller } = makeController({
        url: "https://worker.example/game/g1/ws",
      });
      controller.start();
      await Promise.resolve();
      await Promise.resolve();
      expect(FakeWebSocket.instances[0]!.url).toBe(
        "wss://worker.example/game/g1/ws?token=tok-1",
      );
    }
    FakeWebSocket.instances = [];
    {
      const { controller } = makeController({
        url: "https://worker.example/user/u1/ws?v=2",
      });
      controller.start();
      await Promise.resolve();
      await Promise.resolve();
      expect(FakeWebSocket.instances[0]!.url).toBe(
        "wss://worker.example/user/u1/ws?v=2&token=tok-1",
      );
    }
  });

  it("dispose() closes the socket without scheduling a reconnect", async () => {
    const { controller, harness } = makeController({});
    controller.start();
    await Promise.resolve();
    await Promise.resolve();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();

    const scheduledBefore = harness.scheduledDelays.length;
    controller.dispose();
    expect(ws.close).toHaveBeenCalled();

    // Late onclose (e.g., server-driven) should be a no-op now — onclose was nulled.
    ws.simulateClose();
    expect(harness.scheduledDelays.length).toBe(scheduledBefore);
  });

  it("token fetch failure surfaces 'failed' after MAX attempts", async () => {
    const getToken = vi.fn().mockRejectedValue(new Error("nope"));
    const { controller, harness, advanceTimers } = makeController({ getToken });
    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    // Each attempt fails synchronously after the rejected promise resolves;
    // the retry timer fires the next attempt.
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      // After attempt i: error path scheduled a retry with computeReconnectDelay(i).
      await advanceTimers(computeReconnectDelay(i));
    }

    expect(getToken).toHaveBeenCalledTimes(MAX_RECONNECT_ATTEMPTS + 1);
    expect(harness.statuses[harness.statuses.length - 1]).toBe("failed");
    expect(harness.errors).toContain("Failed to get auth token");
  });
});
