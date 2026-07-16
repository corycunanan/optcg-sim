/**
 * OPT-358 — Presence: User.lastSeen + connect/disconnect broadcast.
 *
 * Covers:
 *   - DO emits `presence:friend_online` when count goes 0 → 1, not on
 *     subsequent attaches.
 *   - DO emits `presence:friend_offline` after a 5s debounce when count goes
 *     N → 0; debounce cancels if a new socket attaches in that window.
 *   - DO calls back to `/api/realtime/friends-of/:userId` and caches the
 *     response for 60s.
 *   - Offline broadcast PATCHes `User.lastSeen` before fanning out.
 *   - Multi-tab: open two tabs, close one → no offline scheduled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESENCE_OFFLINE_DEBOUNCE_MS,
  FRIENDS_CACHE_TTL_MS,
  UserChannel,
} from "../UserChannel.js";
import { log } from "../lib/log.js";
import type { Env } from "../types.js";

// Local HS256 minter — mirrors src/lib/game/token.ts so this worker test
// stays inside the worker tsconfig boundary (no cross-package import).
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
  webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>;
  alarm(): Promise<void>;
  getConnectionCount(): number;
};

const SECRET = "test-realtime-secret";
const USER_ID = "user-abc";
const NEXTJS_URL = "https://app.example.test";

interface FriendsFetchCall {
  url: string;
  auth: string | null;
}

interface LastSeenFetchCall {
  url: string;
  method: string;
  auth: string | null;
  body: string | null;
}

interface ChannelHarness {
  channel: UserChannelTestAccess;
  state: MockDurableObjectState;
  userChannelNs: MockUserChannelNamespace;
  friendsCalls: FriendsFetchCall[];
  lastSeenCalls: LastSeenFetchCall[];
  setFriends(ids: string[]): void;
  setFriendsHttpStatus(status: number): void;
}

function createHarness(): ChannelHarness {
  const durableState = new MockDurableObjectState();
  const userChannelNs = new MockUserChannelNamespace();
  const env = {
    GAME_WORKER_SECRET: SECRET,
    NEXTJS_URL,
    USER_CHANNEL: userChannelNs as unknown as DurableObjectNamespace,
  } as unknown as Env;
  const channel = new UserChannel(
    durableState as unknown as DurableObjectState,
    env,
  ) as unknown as UserChannelTestAccess;

  const friendsCalls: FriendsFetchCall[] = [];
  const lastSeenCalls: LastSeenFetchCall[] = [];
  let friendIds: string[] = [];
  let friendsStatus = 200;

  // Capture the real Response constructor up-front. `attach()` temporarily
  // swaps globalThis.Response to PermissiveResponse during the WS upgrade
  // leg; without this snapshot the fetch mock would build PermissiveResponse
  // instances whose `.ok` getter doesn't exist, breaking every mocked call.
  const RealResponse = originalResponse;
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const headers = (init?.headers ?? (input as Request).headers) as
      | Record<string, string>
      | Headers
      | undefined;
    const auth = readAuth(headers);

    if (url.includes("/api/realtime/friends-of/")) {
      friendsCalls.push({ url, auth });
      if (friendsStatus !== 200) {
        return new RealResponse(`status=${friendsStatus}`, { status: friendsStatus });
      }
      return new RealResponse(JSON.stringify({ data: { friendIds } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/realtime/users/") && url.endsWith("/last-seen")) {
      const body = typeof init?.body === "string" ? init.body : null;
      lastSeenCalls.push({ url, method: init?.method ?? "GET", auth, body });
      return new RealResponse(null, { status: 204 });
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  });

  return {
    channel,
    state: durableState,
    userChannelNs,
    friendsCalls,
    lastSeenCalls,
    setFriends(ids: string[]) { friendIds = ids; },
    setFriendsHttpStatus(status: number) { friendsStatus = status; },
  };
}

function readAuth(headers: Record<string, string> | Headers | undefined): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) {
    return headers.get("authorization") ?? headers.get("Authorization");
  }
  return headers.Authorization ?? headers.authorization ?? null;
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

beforeEach(() => {
  (globalThis as Record<string, unknown>).WebSocketPair = function MockPair(this: Record<number, MockWebSocket>) {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  };
  // Don't patch globalThis.Response here — the fetch mock returns real
  // Response instances (json/text need to work). The CF-style 101 with
  // webSocket is constructed inside handleWebSocket via globalThis.Response,
  // so we patch it just for the WS upgrade slice via attach().
  vi.useFakeTimers();
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

function buildWsRequest(userId: string, token: string): Request {
  const url = `https://worker.example.test/user/${encodeURIComponent(userId)}/ws?token=${encodeURIComponent(token)}`;
  return new Request(url, { headers: { Upgrade: "websocket" } });
}

async function attach(channel: UserChannelTestAccess, userId: string, jti: string): Promise<void> {
  // Patch Response just for the ws upgrade leg — the DO returns a 101 with
  // webSocket prop, which Node's stock Response won't let us construct.
  const originalRes = globalThis.Response;
  globalThis.Response = PermissiveResponse as unknown as typeof Response;
  try {
    const token = await mintToken(userId, SECRET, { jti });
    const res = await channel.fetch(buildWsRequest(userId, token));
    if (res.status !== 101) {
      throw new Error(`expected 101, got ${res.status}`);
    }
  } finally {
    globalThis.Response = originalRes;
  }
}

describe("OPT-358 presence — online broadcast", () => {
  it("broadcasts presence:friend_online when count goes 0 → 1", async () => {
    const h = createHarness();
    h.setFriends(["friend-1", "friend-2"]);

    await attach(h.channel, USER_ID, "online-1");
    await vi.runAllTimersAsync();

    expect(h.friendsCalls).toHaveLength(1);
    expect(h.friendsCalls[0]!.auth).toBe(`Bearer ${SECRET}`);
    expect(h.friendsCalls[0]!.url).toContain(`/api/realtime/friends-of/${USER_ID}`);

    expect(h.userChannelNs.notifies).toHaveLength(2);
    const ids = h.userChannelNs.notifies.map((n) => n.friendId).sort();
    expect(ids).toEqual(["friend-1", "friend-2"]);
    for (const notify of h.userChannelNs.notifies) {
      expect(notify.auth).toBe(`Bearer ${SECRET}`);
      expect(JSON.parse(notify.body)).toEqual({
        type: "presence:friend_online",
        userId: USER_ID,
      });
    }
  });

  it("does NOT broadcast online on the second tab attach", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "online-multi-1");
    await vi.runAllTimersAsync();
    const initialNotifies = h.userChannelNs.notifies.length;

    await attach(h.channel, USER_ID, "online-multi-2");
    await vi.runAllTimersAsync();

    // No new notifies for the second attach; count was 1 → 2, not 0 → 1.
    expect(h.userChannelNs.notifies.length).toBe(initialNotifies);
    expect(h.channel.getConnectionCount()).toBe(2);
  });

  it("skips the online broadcast when an offline debounce is still pending", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    // Tab A connects → online broadcast.
    await attach(h.channel, USER_ID, "skip-flicker-1");
    await vi.runAllTimersAsync();
    expect(h.userChannelNs.notifies).toHaveLength(1);

    // Tab A closes → offline timer scheduled (5s).
    const wsA = h.state.getWebSockets()[0]!;
    h.state.removeSocket(wsA);
    await h.channel.webSocketClose(wsA, 1000, "closed");

    // Tab B connects within the debounce window → cancel timer; no online
    // broadcast (friends never saw the offline transition).
    await attach(h.channel, USER_ID, "skip-flicker-2");
    await vi.runAllTimersAsync();

    // Still just the original online notify; no new ones.
    expect(h.userChannelNs.notifies).toHaveLength(1);

    // Run past the debounce window — the timer was cleared, so still no
    // offline broadcast either.
    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 100);
    expect(h.userChannelNs.notifies).toHaveLength(1);
  });
});

describe("OPT-358 presence — offline broadcast", () => {
  it("debounces offline 5s; broadcasts and PATCHes lastSeen if count stays 0", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "offline-1");
    await vi.runAllTimersAsync();
    h.userChannelNs.notifies.length = 0; // ignore the online fanout
    h.friendsCalls.length = 0;

    const ws = h.state.getWebSockets()[0]!;
    h.state.removeSocket(ws);
    await h.channel.webSocketClose(ws, 1000, "closed");

    // Before the debounce fires: nothing broadcast yet.
    expect(h.userChannelNs.notifies).toHaveLength(0);
    expect(h.lastSeenCalls).toHaveLength(0);

    // Advance to just before the debounce — still no broadcast.
    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS - 100);
    expect(h.userChannelNs.notifies).toHaveLength(0);

    // Cross the boundary — broadcast fires.
    await vi.advanceTimersByTimeAsync(200);
    await vi.runAllTimersAsync();

    expect(h.userChannelNs.notifies).toHaveLength(1);
    const payload = JSON.parse(h.userChannelNs.notifies[0]!.body);
    expect(payload.type).toBe("presence:friend_offline");
    expect(payload.userId).toBe(USER_ID);
    expect(typeof payload.lastSeen).toBe("string");
    expect(Number.isNaN(Date.parse(payload.lastSeen))).toBe(false);

    // PATCH lastSeen called with worker secret.
    expect(h.lastSeenCalls).toHaveLength(1);
    expect(h.lastSeenCalls[0]!.method).toBe("POST");
    expect(h.lastSeenCalls[0]!.auth).toBe(`Bearer ${SECRET}`);
    expect(h.lastSeenCalls[0]!.url).toContain(`/api/realtime/users/${USER_ID}/last-seen`);
  });

  it("cancels the offline broadcast if a socket re-attaches within 5s", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "cancel-1");
    await vi.runAllTimersAsync();
    h.userChannelNs.notifies.length = 0;

    const ws = h.state.getWebSockets()[0]!;
    h.state.removeSocket(ws);
    await h.channel.webSocketClose(ws, 1000, "closed");

    // Re-attach within 1s, well before the 5s debounce.
    await vi.advanceTimersByTimeAsync(1_000);
    await attach(h.channel, USER_ID, "cancel-2");

    // Run past the 5s window — the timer should have been cleared.
    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 100);
    await vi.runAllTimersAsync();

    expect(h.userChannelNs.notifies).toHaveLength(0);
    expect(h.lastSeenCalls).toHaveLength(0);
  });
});

describe("OPT-358 presence — CLOSING-state safety", () => {
  it("schedules offline based on the explicit active-id set, not getWebSockets()", async () => {
    // Cloudflare's getWebSockets() can still report a socket in CLOSING
    // state when webSocketClose fires. Simulate that: do NOT call
    // removeSocket() before close — the DO sees the socket in
    // getWebSockets() but its explicit set is decremented.
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "closing-1");
    await vi.runAllTimersAsync();
    h.userChannelNs.notifies.length = 0;

    const ws = h.state.getWebSockets()[0]!;
    // Intentionally NOT calling state.removeSocket(ws) — leave the socket
    // in CLOSING state per Cloudflare's documented behavior.
    await h.channel.webSocketClose(ws, 1000, "closed");

    // Despite getWebSockets().length === 1, the active set is empty, so
    // the offline timer should still fire after the debounce.
    expect(h.channel.getConnectionCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 200);
    await vi.runAllTimersAsync();

    expect(h.userChannelNs.notifies).toHaveLength(1);
    const payload = JSON.parse(h.userChannelNs.notifies[0]!.body);
    expect(payload.type).toBe("presence:friend_offline");
  });

  it("PATCH /last-seen body matches the broadcast event timestamp exactly", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "ts-consistency-1");
    await vi.runAllTimersAsync();
    h.userChannelNs.notifies.length = 0;
    h.lastSeenCalls.length = 0;

    const ws = h.state.getWebSockets()[0]!;
    h.state.removeSocket(ws);
    await h.channel.webSocketClose(ws, 1000, "closed");

    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 200);
    await vi.runAllTimersAsync();

    expect(h.lastSeenCalls).toHaveLength(1);
    expect(h.userChannelNs.notifies).toHaveLength(1);
    const eventPayload = JSON.parse(h.userChannelNs.notifies[0]!.body);
    expect(eventPayload.type).toBe("presence:friend_offline");
    const rawBody = h.lastSeenCalls[0]!.body;
    expect(typeof rawBody).toBe("string");
    const persisted = JSON.parse(rawBody as string) as { lastSeen?: string };
    expect(persisted.lastSeen).toBe(eventPayload.lastSeen);
  });
});

describe("OPT-358 presence — multi-tab safety", () => {
  it("closing one of two tabs does NOT schedule offline (count still 1)", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "multi-1");
    await attach(h.channel, USER_ID, "multi-2");
    await vi.runAllTimersAsync();
    h.userChannelNs.notifies.length = 0;

    expect(h.channel.getConnectionCount()).toBe(2);

    // Close the first tab — count goes to 1.
    const sockets = h.state.getWebSockets();
    const wsA = sockets[0]!;
    h.state.removeSocket(wsA);
    await h.channel.webSocketClose(wsA, 1000, "closed");

    // Past the debounce window — no offline scheduled because count was 1.
    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 1_000);
    await vi.runAllTimersAsync();

    expect(h.userChannelNs.notifies).toHaveLength(0);
    expect(h.lastSeenCalls).toHaveLength(0);
    expect(h.channel.getConnectionCount()).toBe(1);
  });
});

describe("OPT-358 presence — friends-of cache", () => {
  it("caches the friends list across rapid online broadcasts", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    // First online broadcast → 1 friends-of call.
    await attach(h.channel, USER_ID, "cache-1");
    await vi.runAllTimersAsync();
    expect(h.friendsCalls).toHaveLength(1);

    // Last detach + 5s offline broadcast → still uses cache (no new call).
    const ws = h.state.getWebSockets()[0]!;
    h.state.removeSocket(ws);
    await h.channel.webSocketClose(ws, 1000, "closed");
    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 100);
    await vi.runAllTimersAsync();

    expect(h.friendsCalls).toHaveLength(1);
  });

  it("re-fetches the friends list once the 60s cache TTL expires", async () => {
    const h = createHarness();
    h.setFriends(["friend-1"]);

    await attach(h.channel, USER_ID, "ttl-1");
    await vi.runAllTimersAsync();
    expect(h.friendsCalls).toHaveLength(1);

    // Detach and let the offline broadcast fire (uses cache — still 1 call).
    const ws = h.state.getWebSockets()[0]!;
    h.state.removeSocket(ws);
    await h.channel.webSocketClose(ws, 1000, "closed");
    await vi.advanceTimersByTimeAsync(PRESENCE_OFFLINE_DEBOUNCE_MS + 100);
    await vi.runAllTimersAsync();
    expect(h.friendsCalls).toHaveLength(1);

    // Cross the cache TTL.
    await vi.advanceTimersByTimeAsync(FRIENDS_CACHE_TTL_MS);
    await vi.runAllTimersAsync();

    // Re-attach — now the cache is stale, expect a refetch.
    await attach(h.channel, USER_ID, "ttl-2");
    await vi.runAllTimersAsync();

    expect(h.friendsCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("swallows a friends-of fetch failure without throwing", async () => {
    const h = createHarness();
    h.setFriendsHttpStatus(500);
    const logMock = vi.mocked(log);
    logMock.mockClear();

    // Online broadcast tries fetchFriends and logs+returns; should not throw.
    await expect(attach(h.channel, USER_ID, "fail-1")).resolves.toBeUndefined();
    await vi.runAllTimersAsync();

    expect(h.userChannelNs.notifies).toHaveLength(0);
    expect(logMock).toHaveBeenCalledWith("user_channel.friends_fetch_failed", {
      userId: USER_ID,
      error: "friends-of 500",
    });
  });
});
