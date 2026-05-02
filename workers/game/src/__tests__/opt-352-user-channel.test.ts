/**
 * OPT-352 — UserChannel DO + worker user routes.
 *
 * Covers:
 *   - WS upgrade admits a token whose `sub === :userId`
 *   - WS upgrade rejects a sub-mismatched token (403)
 *   - Expired token rejected (401)
 *   - Replayed JTI rejected (401)
 *   - /user/:userId/notify enforces Bearer secret (401 on bad)
 *   - DO accepts multiple sockets for the same userId; getConnectionCount matches
 *   - Idle reap alarm clears storage when no sockets remain
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UserChannel } from "../UserChannel.js";
import type { Env } from "../types.js";

// Local HS256 minter — mirrors src/lib/game/token.ts so this worker test
// stays inside the worker tsconfig boundary (no cross-package import).
async function mintToken(
  userId: string,
  secret: string,
  options: { jti?: string; now?: number; expiresInSeconds?: number; gameId?: string } = {},
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
    ...(options.gameId ? { gameId: options.gameId } : {}),
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
  public deleteAllCalls = 0;

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
      this.deleteAllCalls += 1;
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

  getTags(ws: WebSocket): string[] {
    return this.tags.get(ws as unknown as MockWebSocket) ?? [];
  }

  /** Test-only: simulate hibernation removing the socket after close. */
  removeSocket(ws: WebSocket): void {
    const mock = ws as unknown as MockWebSocket;
    this.sockets = this.sockets.filter((s) => s !== mock);
    this.tags.delete(mock);
  }
}

type UserChannelTestAccess = {
  fetch(request: Request): Promise<Response>;
  webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>;
  alarm(): Promise<void>;
  getConnectionCount(): number;
};

const SECRET = "test-realtime-secret";
const USER_ID = "user-abc";

function createChannel(): { channel: UserChannelTestAccess; state: MockDurableObjectState } {
  const durableState = new MockDurableObjectState();
  const env = {
    GAME_WORKER_SECRET: SECRET,
    NEXTJS_URL: "https://app.example.test",
  } as Env;
  const channel = new UserChannel(
    durableState as unknown as DurableObjectState,
    env,
  ) as unknown as UserChannelTestAccess;
  return { channel, state: durableState };
}

const originalWebSocketPair = (globalThis as Record<string, unknown>).WebSocketPair;
const originalResponse = globalThis.Response;

// node's undici-based Response constructor rejects status 101 (per the
// Fetch spec), but Cloudflare Workers permit it for WebSocket upgrades.
// Stub Response with a permissive shape so tests can exercise the upgrade
// path without depending on `wrangler dev`.
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

beforeEach(() => {
  // Cloudflare's WebSocketPair returns an object indexed [0]/[1]. Mirror that
  // shape with two MockWebSocket instances so handleWebSocket can run in node.
  (globalThis as Record<string, unknown>).WebSocketPair = function MockPair(this: Record<number, MockWebSocket>) {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  };
  (globalThis as Record<string, unknown>).Response = PermissiveResponse;
});

afterEach(() => {
  if (originalWebSocketPair === undefined) {
    delete (globalThis as Record<string, unknown>).WebSocketPair;
  } else {
    (globalThis as Record<string, unknown>).WebSocketPair = originalWebSocketPair;
  }
  (globalThis as Record<string, unknown>).Response = originalResponse;
});

function buildWsRequest(userId: string, token: string): Request {
  const url = `https://worker.example.test/user/${encodeURIComponent(userId)}/ws?token=${encodeURIComponent(token)}`;
  return new Request(url, { headers: { Upgrade: "websocket" } });
}

function buildNotifyRequest(
  userId: string,
  body: BodyInit,
  options: { auth?: string; contentType?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": options.contentType ?? "application/json",
  };
  if (options.auth !== undefined) headers.Authorization = options.auth;
  return new Request(`https://worker.example.test/user/${encodeURIComponent(userId)}/notify`, {
    method: "POST",
    body,
    headers,
  });
}

function buildHealthRequest(userId: string, options: { auth?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.auth !== undefined) headers.Authorization = options.auth;
  return new Request(`https://worker.example.test/user/${encodeURIComponent(userId)}/health`, {
    headers,
  });
}

describe("OPT-352 UserChannel WS upgrade", () => {
  it("admits a token whose sub matches the path userId", async () => {
    const { channel, state } = createChannel();
    const token = await mintToken(USER_ID, SECRET, { jti: "jti-ok" });

    const res = await channel.fetch(buildWsRequest(USER_ID, token));

    expect(res.status).toBe(101);
    expect(state.getWebSockets().length).toBe(1);
    expect(state.alarmAt).toBeNull();
  });

  it("rejects a token whose sub does not match the path userId", async () => {
    const { channel } = createChannel();
    const token = await mintToken("someone-else", SECRET, { jti: "jti-mismatch" });

    const res = await channel.fetch(buildWsRequest(USER_ID, token));

    expect(res.status).toBe(403);
  });

  it("rejects an expired token", async () => {
    const { channel } = createChannel();
    const expired = await mintToken(USER_ID, SECRET, {
      jti: "jti-exp",
      now: Math.floor(Date.now() / 1000) - 600,
      expiresInSeconds: 1,
    });

    const res = await channel.fetch(buildWsRequest(USER_ID, expired));

    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { channel } = createChannel();
    const token = await mintToken(USER_ID, "wrong-secret", { jti: "jti-bad-sig" });

    const res = await channel.fetch(buildWsRequest(USER_ID, token));

    expect(res.status).toBe(401);
  });

  it("rejects a replayed JTI", async () => {
    const { channel } = createChannel();
    const token = await mintToken(USER_ID, SECRET, { jti: "jti-replay" });

    const first = await channel.fetch(buildWsRequest(USER_ID, token));
    const second = await channel.fetch(buildWsRequest(USER_ID, token));

    expect(first.status).toBe(101);
    expect(second.status).toBe(401);
  });

  it("accepts multiple sockets for the same userId and reports the count", async () => {
    const { channel, state } = createChannel();
    const token1 = await mintToken(USER_ID, SECRET, { jti: "tab-1" });
    const token2 = await mintToken(USER_ID, SECRET, { jti: "tab-2" });
    const token3 = await mintToken(USER_ID, SECRET, { jti: "tab-3" });

    expect((await channel.fetch(buildWsRequest(USER_ID, token1))).status).toBe(101);
    expect((await channel.fetch(buildWsRequest(USER_ID, token2))).status).toBe(101);
    expect((await channel.fetch(buildWsRequest(USER_ID, token3))).status).toBe(101);

    expect(channel.getConnectionCount()).toBe(3);
    expect(state.getWebSockets().length).toBe(3);
  });

  it("rejects a token that carries a gameId claim (misrouted game token)", async () => {
    const { channel } = createChannel();
    const gameToken = await mintToken(USER_ID, SECRET, {
      jti: "jti-game-misrouted",
      gameId: "some-game",
    });

    const res = await channel.fetch(buildWsRequest(USER_ID, gameToken));

    expect(res.status).toBe(401);
  });

  it("requires Upgrade: websocket on the ws route", async () => {
    const { channel } = createChannel();
    const token = await mintToken(USER_ID, SECRET, { jti: "jti-no-upgrade" });
    const url = `https://worker.example.test/user/${USER_ID}/ws?token=${encodeURIComponent(token)}`;

    const res = await channel.fetch(new Request(url));

    expect(res.status).toBe(400);
  });

  it("requires a token query parameter", async () => {
    const { channel } = createChannel();
    const url = `https://worker.example.test/user/${USER_ID}/ws`;

    const res = await channel.fetch(new Request(url, { headers: { Upgrade: "websocket" } }));

    expect(res.status).toBe(401);
  });
});

describe("OPT-352 UserChannel notify", () => {
  it("rejects notify with no Authorization header", async () => {
    const { channel } = createChannel();

    const res = await channel.fetch(buildNotifyRequest(USER_ID, "{}"));

    expect(res.status).toBe(401);
  });

  it("rejects notify with the wrong Bearer secret", async () => {
    const { channel } = createChannel();

    const res = await channel.fetch(buildNotifyRequest(USER_ID, "{}", { auth: "Bearer nope" }));

    expect(res.status).toBe(401);
  });

  it("fans out a JSON notify body as a text frame to every attached socket", async () => {
    const { channel, state } = createChannel();
    const token1 = await mintToken(USER_ID, SECRET, { jti: "fanout-tab-1" });
    const token2 = await mintToken(USER_ID, SECRET, { jti: "fanout-tab-2" });
    await channel.fetch(buildWsRequest(USER_ID, token1));
    await channel.fetch(buildWsRequest(USER_ID, token2));

    const payload = JSON.stringify({ type: "test:event", value: 42 });
    const res = await channel.fetch(buildNotifyRequest(USER_ID, payload, { auth: `Bearer ${SECRET}` }));

    expect(res.status).toBe(202);
    const sockets = state.getWebSockets() as unknown as MockWebSocket[];
    expect(sockets).toHaveLength(2);
    for (const ws of sockets) {
      expect(ws.sent).toEqual([payload]);
    }
  });

  it("preserves a non-UTF-8 binary notify body as a binary frame", async () => {
    const { channel, state } = createChannel();
    const token = await mintToken(USER_ID, SECRET, { jti: "fanout-binary-tab" });
    await channel.fetch(buildWsRequest(USER_ID, token));

    // Bytes that are NOT valid UTF-8 — would mojibake under TextDecoder.
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd, 0x00, 0x01, 0x02]);
    const res = await channel.fetch(buildNotifyRequest(USER_ID, bytes, {
      auth: `Bearer ${SECRET}`,
      contentType: "application/octet-stream",
    }));

    expect(res.status).toBe(202);
    const ws = (state.getWebSockets() as unknown as MockWebSocket[])[0]!;
    expect(ws.sent).toHaveLength(1);
    const sent = ws.sent[0];
    expect(sent).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(sent as ArrayBuffer)).toEqual(bytes);
  });
});

describe("OPT-352 UserChannel health", () => {
  it("rejects health with no Authorization header", async () => {
    const { channel } = createChannel();

    const res = await channel.fetch(buildHealthRequest(USER_ID));

    expect(res.status).toBe(401);
  });

  it("rejects health with the wrong Bearer secret", async () => {
    const { channel } = createChannel();

    const res = await channel.fetch(buildHealthRequest(USER_ID, { auth: "Bearer nope" }));

    expect(res.status).toBe(401);
  });

  it("returns the connection count when authed", async () => {
    const { channel } = createChannel();
    const t1 = await mintToken(USER_ID, SECRET, { jti: "health-tab-1" });
    const t2 = await mintToken(USER_ID, SECRET, { jti: "health-tab-2" });
    await channel.fetch(buildWsRequest(USER_ID, t1));
    await channel.fetch(buildWsRequest(USER_ID, t2));

    const res = await channel.fetch(buildHealthRequest(USER_ID, { auth: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    const body = await res.json() as { connections: number };
    expect(body.connections).toBe(2);
  });
});

describe("OPT-352 UserChannel idle reap", () => {
  it("schedules an idle-reap alarm when a socket closes", async () => {
    const { channel, state } = createChannel();
    const token = await mintToken(USER_ID, SECRET, { jti: "reap-tab-1" });
    await channel.fetch(buildWsRequest(USER_ID, token));
    const ws = state.getWebSockets()[0]!;

    expect(state.alarmAt).toBeNull();

    state.removeSocket(ws);
    await channel.webSocketClose(ws, 1000, "closed");

    expect(state.alarmAt).not.toBeNull();
    expect(state.alarmAt!).toBeGreaterThan(Date.now());
  });

  it("on alarm with zero sockets, deletes all storage", async () => {
    const { channel, state } = createChannel();

    await channel.alarm();

    expect(state.deleteAllCalls).toBe(1);
  });

  it("on alarm with sockets still attached, does NOT delete storage", async () => {
    const { channel, state } = createChannel();
    const token = await mintToken(USER_ID, SECRET, { jti: "still-here" });
    await channel.fetch(buildWsRequest(USER_ID, token));

    await channel.alarm();

    expect(state.deleteAllCalls).toBe(0);
  });

  it("re-attaching cancels a pending idle-reap alarm", async () => {
    const { channel, state } = createChannel();
    const token1 = await mintToken(USER_ID, SECRET, { jti: "reap-cancel-1" });
    await channel.fetch(buildWsRequest(USER_ID, token1));
    const ws = state.getWebSockets()[0]!;

    state.removeSocket(ws);
    await channel.webSocketClose(ws, 1000, "closed");
    expect(state.alarmAt).not.toBeNull();

    const token2 = await mintToken(USER_ID, SECRET, { jti: "reap-cancel-2" });
    await channel.fetch(buildWsRequest(USER_ID, token2));

    expect(state.alarmAt).toBeNull();
  });
});
