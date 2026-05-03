/**
 * OPT-359 — Client→server typing-indicator vocabulary in `UserChannel`.
 *
 * Covers:
 *   - DO accepts `chat:typing` and forwards `chat:typing_received` to the
 *     recipient's DO via env.USER_CHANNEL.idFromName(toUserId).
 *   - Inbound throttle: rapid emits collapse to 1 per TYPING_THROTTLE_MS.
 *   - Validation: malformed shapes are dropped, not forwarded.
 *   - `until` is clamped to now + TYPING_MAX_UNTIL_MS.
 *   - Self-target events are dropped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TYPING_THROTTLE_MS,
  TYPING_MAX_UNTIL_MS,
  UserChannel,
} from "../UserChannel.js";
import type { Env } from "../types.js";

async function mintToken(
  userId: string,
  secret: string,
  options: { jti?: string; now?: number; expiresInSeconds?: number } = {},
): Promise<string> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const jti = options.jti ?? crypto.randomUUID();
  const expiresInSeconds = options.expiresInSeconds ?? 300;
  const headerB64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadB64 = b64url(JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + expiresInSeconds,
    jti,
  }));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlBytes(new Uint8Array(sig))}`;
}

function b64url(input: string): string {
  return b64urlBytes(new TextEncoder().encode(input));
}

function b64urlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

class MockWebSocket {
  sent: (string | ArrayBuffer)[] = [];
  closeCalls: { code?: number; reason?: string }[] = [];
  private attachment: unknown = null;

  send(payload: string | ArrayBuffer): void { this.sent.push(payload); }
  close(code?: number, reason?: string): void { this.closeCalls.push({ code, reason }); }
  serializeAttachment(value: unknown): void { this.attachment = value; }
  deserializeAttachment(): unknown { return this.attachment; }
}

class MockDurableObjectState {
  private sockets: MockWebSocket[] = [];
  private tags = new Map<MockWebSocket, string[]>();
  private storageMap = new Map<string, unknown>();
  public alarmAt: number | null = null;

  storage = {
    put: async (key: string, value: unknown): Promise<void> => {
      this.storageMap.set(key, value);
    },
    get: async <T,>(key: string): Promise<T | undefined> => {
      return this.storageMap.get(key) as T | undefined;
    },
    setAlarm: async (when: number): Promise<void> => {
      this.alarmAt = when;
    },
    deleteAlarm: async (): Promise<void> => {
      this.alarmAt = null;
    },
    deleteAll: async (): Promise<void> => {
      this.storageMap.clear();
    },
  };

  acceptWebSocket(ws: WebSocket, tags?: string[]): void {
    const mock = ws as unknown as MockWebSocket;
    this.sockets.push(mock);
    this.tags.set(mock, tags ?? []);
  }

  getWebSockets(tag?: string): WebSocket[] {
    const sockets = tag
      ? this.sockets.filter((ws) => this.tags.get(ws)?.includes(tag))
      : this.sockets;
    return sockets as unknown as WebSocket[];
  }
}

interface NotifyCapture {
  friendId: string;
  body: string;
  auth: string | null;
}

class MockUserChannelNamespace {
  notifies: NotifyCapture[] = [];

  idFromName(name: string): { name: string } { return { name }; }

  get(id: { name: string }): { fetch: (url: string, init: RequestInit) => Promise<Response> } {
    return {
      fetch: async (_url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string> | undefined;
        this.notifies.push({
          friendId: id.name,
          body: typeof init.body === "string" ? init.body : "",
          auth: headers?.Authorization ?? headers?.authorization ?? null,
        });
        return new Response(null, { status: 202 });
      },
    };
  }
}

type UserChannelTestAccess = {
  fetch(request: Request): Promise<Response>;
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
};

const SECRET = "test-realtime-secret";
const SENDER_ID = "user-sender";
const TARGET_ID = "user-target";

interface ChannelHarness {
  channel: UserChannelTestAccess;
  state: MockDurableObjectState;
  userChannelNs: MockUserChannelNamespace;
  attach(userId: string, jti: string): Promise<MockWebSocket>;
}

const originalWebSocketPair = (globalThis as Record<string, unknown>).WebSocketPair;
const originalResponse = globalThis.Response;

class PermissiveResponse {
  status: number;
  body: BodyInit | null;
  webSocket: unknown;
  headers: Headers;

  constructor(body: BodyInit | null = null, init: ResponseInit & { webSocket?: unknown } = {}) {
    this.status = init.status ?? 200;
    this.body = body;
    this.webSocket = (init as { webSocket?: unknown }).webSocket;
    this.headers = new Headers(init.headers ?? {});
  }

  async json(): Promise<unknown> { return this.body ? JSON.parse(String(this.body)) : null; }
  async text(): Promise<string> { return this.body ? String(this.body) : ""; }
}

function createHarness(): ChannelHarness {
  const durableState = new MockDurableObjectState();
  const userChannelNs = new MockUserChannelNamespace();
  const env = {
    GAME_WORKER_SECRET: SECRET,
    NEXTJS_URL: "https://app.example.test",
    USER_CHANNEL: userChannelNs as unknown as DurableObjectNamespace,
  } as unknown as Env;
  const channel = new UserChannel(
    durableState as unknown as DurableObjectState,
    env,
  ) as unknown as UserChannelTestAccess;

  async function attach(userId: string, jti: string): Promise<MockWebSocket> {
    const originalRes = globalThis.Response;
    globalThis.Response = PermissiveResponse as unknown as typeof Response;
    try {
      const token = await mintToken(userId, SECRET, { jti });
      const url = `https://worker.example.test/user/${encodeURIComponent(userId)}/ws?token=${encodeURIComponent(token)}`;
      const res = await channel.fetch(new Request(url, { headers: { Upgrade: "websocket" } }));
      if (res.status !== 101) {
        throw new Error(`expected 101, got ${res.status}`);
      }
      const sockets = durableState.getWebSockets() as unknown as MockWebSocket[];
      return sockets[sockets.length - 1];
    } finally {
      globalThis.Response = originalRes;
    }
  }

  return { channel, state: durableState, userChannelNs, attach };
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).WebSocketPair = function MockPair(this: Record<number, MockWebSocket>) {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-03T00:00:00.000Z"));
});

afterEach(() => {
  if (originalWebSocketPair === undefined) {
    delete (globalThis as Record<string, unknown>).WebSocketPair;
  } else {
    (globalThis as Record<string, unknown>).WebSocketPair = originalWebSocketPair;
  }
  globalThis.Response = originalResponse;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OPT-359 typing — client→server forward", () => {
  it("forwards chat:typing as chat:typing_received to the recipient's DO", async () => {
    const harness = createHarness();
    const ws = await harness.attach(SENDER_ID, "jti-1");

    const until = Date.now() + 3_000;
    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "chat:typing", toUserId: TARGET_ID, until }),
    );

    expect(harness.userChannelNs.notifies).toHaveLength(1);
    const notify = harness.userChannelNs.notifies[0];
    expect(notify.friendId).toBe(TARGET_ID);
    expect(notify.auth).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(notify.body)).toEqual({
      type: "chat:typing_received",
      fromUserId: SENDER_ID,
      until,
    });
  });

  it("throttles bursts to 1 emit per TYPING_THROTTLE_MS", async () => {
    const harness = createHarness();
    const ws = await harness.attach(SENDER_ID, "jti-throttle");

    const t0 = Date.now();
    for (let i = 0; i < 10; i += 1) {
      await harness.channel.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: "chat:typing", toUserId: TARGET_ID, until: t0 + 3_000 }),
      );
    }

    expect(harness.userChannelNs.notifies).toHaveLength(1);

    // Advance past the throttle window — the next emit should fire again.
    vi.setSystemTime(new Date(t0 + TYPING_THROTTLE_MS + 1));
    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "chat:typing", toUserId: TARGET_ID, until: Date.now() + 3_000 }),
    );

    expect(harness.userChannelNs.notifies).toHaveLength(2);
  });

  it("clamps `until` to now + TYPING_MAX_UNTIL_MS", async () => {
    const harness = createHarness();
    const ws = await harness.attach(SENDER_ID, "jti-clamp");

    const farFuture = Date.now() + 60 * 60 * 1_000;
    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "chat:typing", toUserId: TARGET_ID, until: farFuture }),
    );

    const notify = harness.userChannelNs.notifies[0];
    const parsed = JSON.parse(notify.body) as { until: number };
    expect(parsed.until).toBeLessThanOrEqual(Date.now() + TYPING_MAX_UNTIL_MS);
  });

  it("drops self-target events", async () => {
    const harness = createHarness();
    const ws = await harness.attach(SENDER_ID, "jti-self");

    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "chat:typing", toUserId: SENDER_ID, until: Date.now() + 3_000 }),
    );

    expect(harness.userChannelNs.notifies).toHaveLength(0);
  });

  it("drops malformed shapes without forwarding", async () => {
    const harness = createHarness();
    const ws = await harness.attach(SENDER_ID, "jti-bad");

    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "chat:typing", toUserId: 123, until: "soon" }),
    );
    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      "not json",
    );
    await harness.channel.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ type: "unknown:event", payload: "x" }),
    );

    expect(harness.userChannelNs.notifies).toHaveLength(0);
  });
});
