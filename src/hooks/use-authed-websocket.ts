"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "@/types/realtime";

// After MAX_RECONNECT_ATTEMPTS consecutive failed connection attempts we stop
// retrying and surface a "failed" status so the UI can show an actionable
// error instead of spinning forever. Total elapsed time at the last attempt is
// roughly sum(1,2,4,8,16,30) = 61s, which is long enough to distinguish a
// transient dropout from a persistent failure (bad network, TLS block, token
// endpoint down).
export const MAX_RECONNECT_ATTEMPTS = 6;
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30_000;

export function computeReconnectDelay(attempts: number): number {
  return Math.min(RECONNECT_BASE_MS * Math.pow(2, attempts), RECONNECT_MAX_MS);
}

/**
 * OPT-350 supersede-safe close invariant. Returns `true` only when the closing
 * socket is the live one AND the controller is not in an unmount/manual-close
 * state. Server-initiated supersedes (Strict Mode double-mount, mid-handshake
 * duplicates) close the orphan ws after a newer one has already become
 * authoritative; the orphan's onclose must not null `wsRef` and must not
 * schedule a reconnect, or we kick off a runaway loop.
 */
export function shouldHandleClose(args: {
  ws: unknown;
  liveWs: unknown;
  stopped: boolean;
  manuallyClosed: boolean;
}): boolean {
  if (args.liveWs !== args.ws) return false;
  if (args.stopped || args.manuallyClosed) return false;
  return true;
}

interface MinimalWebSocket {
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

type WebSocketCtor = new (url: string) => MinimalWebSocket;

interface MinimalWebSocketCtor extends WebSocketCtor {
  readonly OPEN: number;
}

export interface AuthedWebSocketControllerOptions<TServerMessage> {
  url: string | null;
  getToken: () => Promise<string>;
  onMessage: (msg: TServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onErrorChange: (error: string | null) => void;
  // Test seams. Production callers should leave these undefined.
  WebSocketCtor?: MinimalWebSocketCtor;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
}

export interface AuthedWebSocketController {
  start(): void;
  retry(): void;
  send(payload: unknown): void;
  close(): Promise<void>;
  /**
   * Tear down without marking manualClose. Used by the React hook on unmount
   * or when `url`/`getToken` change identity to force a reconnect with the
   * new dependencies.
   */
  dispose(): void;
}

/**
 * Pure factory that owns the WebSocket lifecycle: token-refetch-on-every-connect,
 * exponential reconnect, supersede-safe onclose. No React dependency — the hook
 * `useAuthedWebSocket` is a thin adapter that wires status/error callbacks into
 * `useState`.
 *
 * Token contract: `getToken` is awaited on every connect attempt (not cached).
 * The HS256 tokens we issue expire after 5 minutes; reusing a stale token on
 * reconnect causes a 401 loop. This is non-negotiable per the OPT-350 incident.
 */
export function createAuthedWebSocketController<TServerMessage>(
  opts: AuthedWebSocketControllerOptions<TServerMessage>
): AuthedWebSocketController {
  const setTimeoutImpl =
    opts.setTimeoutFn ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimeoutImpl =
    opts.clearTimeoutFn ??
    ((id) => {
      if (typeof id === "number") globalThis.clearTimeout(id);
    });
  // DOM WebSocket's callback `this` parameters prevent structural assignment
  // to the minimal test seam even though the runtime constructor is compatible.
  const WS =
    opts.WebSocketCtor ??
    (globalThis.WebSocket as unknown as MinimalWebSocketCtor);

  let ws: MinimalWebSocket | null = null;
  let reconnectTimerId: unknown = null;
  let attempts = 0;
  let stopped = false;
  let manuallyClosed = false;
  // Connection generation. Every `connect()` captures the current value, then
  // re-checks it after `await getToken()` returns. Any in-flight attempt whose
  // generation has been bumped (by retry, close, dispose, or another connect)
  // aborts before installing its socket. Without this guard, a slow token
  // fetch from an earlier attempt can resolve last and overwrite the live ws
  // with a stale socket — and `close()` during a pending fetch can race a
  // socket open past the close.
  let generation = 0;

  function scheduleReconnect() {
    const delay = computeReconnectDelay(attempts);
    attempts += 1;
    reconnectTimerId = setTimeoutImpl(() => {
      reconnectTimerId = null;
      void connect();
    }, delay);
  }

  async function connect() {
    if (!opts.url) return;
    if (stopped) return;
    manuallyClosed = false;

    generation += 1;
    const myGen = generation;

    let token: string;
    try {
      token = await opts.getToken();
    } catch {
      if (stopped || myGen !== generation) return;
      opts.onErrorChange("Failed to get auth token");
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        opts.onStatusChange("failed");
        return;
      }
      opts.onStatusChange("error");
      scheduleReconnect();
      return;
    }

    if (stopped || myGen !== generation || manuallyClosed) return;

    const separator = opts.url.includes("?") ? "&" : "?";
    const wsUrl =
      `${opts.url}${separator}token=${encodeURIComponent(token)}`.replace(
        /^http/,
        "ws"
      );

    const socket = new WS(wsUrl);
    ws = socket;
    opts.onStatusChange("connecting");

    socket.onopen = () => {
      if (stopped) {
        socket.close();
        return;
      }
      opts.onStatusChange("connected");
      attempts = 0;
    };

    socket.onmessage = (event) => {
      let msg: TServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.warn(
          "[useAuthedWebSocket] failed to parse server message",
          err,
          event.data
        );
        return;
      }
      opts.onMessage(msg);
    };

    socket.onerror = (err) => {
      console.warn("[useAuthedWebSocket] websocket error", err);
      if (!stopped) opts.onStatusChange("error");
    };

    socket.onclose = () => {
      if (
        !shouldHandleClose({ ws: socket, liveWs: ws, stopped, manuallyClosed })
      ) {
        return;
      }
      ws = null;

      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        opts.onStatusChange("failed");
        return;
      }

      opts.onStatusChange("disconnected");
      scheduleReconnect();
    };
  }

  return {
    start() {
      stopped = false;
      void connect();
    },

    retry() {
      attempts = 0;
      if (reconnectTimerId !== null) {
        clearTimeoutImpl(reconnectTimerId);
        reconnectTimerId = null;
      }
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      opts.onErrorChange(null);
      opts.onStatusChange("connecting");
      void connect();
    },

    send(payload: unknown) {
      if (!ws || ws.readyState !== WS.OPEN) {
        opts.onErrorChange("Not connected");
        return;
      }
      ws.send(JSON.stringify(payload));
      opts.onErrorChange(null);
    },

    async close() {
      manuallyClosed = true;
      generation += 1; // invalidate any pending connect()
      if (reconnectTimerId !== null) {
        clearTimeoutImpl(reconnectTimerId);
        reconnectTimerId = null;
      }
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      ws = null;
      opts.onStatusChange("disconnected");
    },

    dispose() {
      stopped = true;
      generation += 1; // invalidate any pending connect()
      if (reconnectTimerId !== null) {
        clearTimeoutImpl(reconnectTimerId);
        reconnectTimerId = null;
      }
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      ws = null;
    },
  };
}

export interface UseAuthedWebSocketOptions<TServerMessage> {
  /** WebSocket base URL. `null` suppresses the connection (e.g., signed-out). */
  url: string | null;
  /**
   * Async token fetcher. Re-invoked on every connect attempt — never cached.
   * Identity changes force a reconnect with the new fetcher.
   */
  getToken: () => Promise<string>;
  onMessage: (msg: TServerMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export interface UseAuthedWebSocketResult {
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  send: (payload: unknown) => void;
  retry: () => void;
  close: () => Promise<void>;
}

/**
 * React adapter around `createAuthedWebSocketController`. See that factory's
 * docstring for the lifecycle contract. The hook is intentionally thin so the
 * lifecycle logic can be unit-tested without React.
 */
export function useAuthedWebSocket<TServerMessage>(
  opts: UseAuthedWebSocketOptions<TServerMessage>
): UseAuthedWebSocketResult {
  const { url, getToken, onMessage, onStatusChange } = opts;

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);

  // Latest callbacks via refs so changing identities don't tear down the socket.
  // `url` and `getToken` *do* tear down (via the effect dep array) — this matches
  // the original `useGameWs` reconnect behavior.
  const onMessageRef = useRef(onMessage);
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const controllerRef = useRef<AuthedWebSocketController | null>(null);

  useEffect(() => {
    const controller = createAuthedWebSocketController<TServerMessage>({
      url,
      getToken,
      onMessage: (msg) => onMessageRef.current(msg),
      onStatusChange: (status) => {
        setConnectionStatus(status);
        onStatusChangeRef.current?.(status);
      },
      onErrorChange: setLastError,
    });
    controllerRef.current = controller;
    controller.start();
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [url, getToken]);

  const send = useCallback((payload: unknown) => {
    controllerRef.current?.send(payload);
  }, []);

  const retry = useCallback(() => {
    controllerRef.current?.retry();
  }, []);

  const close = useCallback(async () => {
    const controller = controllerRef.current;
    if (controller) {
      await controller.close();
    }
  }, []);

  return { connectionStatus, lastError, send, retry, close };
}
