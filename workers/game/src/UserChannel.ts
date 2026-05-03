/**
 * UserChannel Durable Object
 *
 * Per-user fanout channel for cross-player pushes. One DO instance per user,
 * keyed by `env.USER_CHANNEL.idFromName(userId)`. Holds N WebSockets so a
 * user can have multiple tabs open and receive every event on each tab.
 *
 * Presence (OPT-358): the DO drives `presence:friend_online` /
 * `presence:friend_offline` events. The first socket attaching to a DO with
 * count 0 broadcasts online to the user's friends; the last socket detaching
 * starts a 5s debounce — if no socket attaches before it fires, the DO
 * broadcasts offline and PATCHes `User.lastSeen`. Multi-tab safety follows
 * automatically: a second tab opening within the 5s window cancels the timer
 * before friends see any flicker.
 */

import type { Env } from "./types.js";
import { verifyUserToken } from "./util/auth.js";
import { consumeTokenJti } from "./util/token-replay.js";
import { configureLogger, log } from "./lib/log.js";

const IDLE_REAP_AFTER_MS = 10 * 60 * 1000;
const MAX_CLIENT_MESSAGE_BYTES = 8 * 1024;
const ROUTE_PATTERN = /^\/user\/([^/]+)\/(ws|notify|health)$/;

/**
 * Mirrors `DISCONNECT_BROADCAST_DEBOUNCE_MS` in GameSession.ts:64. 5s is
 * enough to absorb a tab-swap, single-tab reload, or short network hiccup
 * without the user's friends seeing an offline → online flicker.
 */
export const PRESENCE_OFFLINE_DEBOUNCE_MS = 5_000;
export const FRIENDS_CACHE_TTL_MS = 60_000;
const FANOUT_TIMEOUT_MS = 2_000;

interface UserSocketAttachment {
  type: "user-channel-socket";
  userId: string;
  connectionId: string;
  attachedAt: number;
}

interface FriendsCacheEntry {
  ids: string[];
  expiresAt: number;
}

function isUserSocketAttachment(value: unknown): value is UserSocketAttachment {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<UserSocketAttachment>;
  return (
    candidate.type === "user-channel-socket"
    && typeof candidate.userId === "string"
    && typeof candidate.connectionId === "string"
    && typeof candidate.attachedAt === "number"
  );
}

export class UserChannel implements DurableObject {
  state: DurableObjectState;
  env: Env;
  private nextSequence = 0;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private friendsCache: FriendsCacheEntry | null = null;
  /**
   * Explicit set of attached connection ids. The DO's `getWebSockets()` is
   * not a real-time count during close handshakes — sockets in CLOSING
   * state can linger before `webSocketClose` fires (Cloudflare DO docs).
   * Tracking attach/detach explicitly gives accurate 0→1 / N→0 transitions
   * for the presence broadcast logic.
   */
  private activeConnectionIds: Set<string>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    configureLogger(env.LOG_URL);
    // Rehydrate from hibernated WebSockets — when the DO instance is
    // reconstructed after hibernation, `getWebSockets()` returns the
    // existing sockets, but the in-memory set is empty. Initializing from
    // attachments preserves the count across hibernate/wake cycles.
    this.activeConnectionIds = new Set();
    for (const ws of this.state.getWebSockets()) {
      try {
        const attachment = ws.deserializeAttachment();
        if (isUserSocketAttachment(attachment)) {
          this.activeConnectionIds.add(attachment.connectionId);
        }
      } catch { /* malformed attachment — ignore */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(ROUTE_PATTERN);
    if (!match) return new Response("Not found", { status: 404 });
    const [, userId, route] = match;

    if (route === "ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket upgrade", { status: 400 });
      }
      return this.handleWebSocket(request, userId);
    }

    if (route === "notify") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return this.handleNotify(request, userId);
    }

    if (route === "health") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      return this.handleHealth(request, userId);
    }

    return new Response("Not found", { status: 404 });
  }

  // ─── WebSocket upgrade ─────────────────────────────────────────────────────

  private async handleWebSocket(request: Request, userId: string): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) return new Response("Missing token", { status: 401 });

    const payload = await verifyUserToken(token, this.env.GAME_WORKER_SECRET);
    if (!payload) {
      log("auth.failure", { reason: "invalid_user_token", userId });
      return new Response("Unauthorized", { status: 401 });
    }
    if (payload.sub !== userId) {
      log("auth.failure", { reason: "user_mismatch", userId, sub: payload.sub });
      return new Response("Forbidden", { status: 403 });
    }

    const consumed = await consumeTokenJti(this.state.storage, payload.jti, payload.exp);
    if (!consumed) {
      log("auth.failure", { reason: "user_token_replay", userId });
      return new Response("Unauthorized", { status: 401 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const attachedAt = Date.now();
    const attachment: UserSocketAttachment = {
      type: "user-channel-socket",
      userId,
      connectionId: `${attachedAt}-${this.nextSequence++}`,
      attachedAt,
    };
    this.state.acceptWebSocket(server, [`user-${userId}`]);
    server.serializeAttachment(attachment);
    this.activeConnectionIds.add(attachment.connectionId);

    // A live socket cancels any pending idle-reap.
    await this.state.storage.deleteAlarm();

    // Presence: a size of 1 immediately after attach means this socket is
    // the first. Either (a) we were already advertised offline and need to
    // broadcast online, or (b) we're racing a still-pending offline
    // debounce, in which case cancelling the timer keeps friends on "online"
    // without a flicker.
    if (this.activeConnectionIds.size === 1) {
      if (this.offlineTimer !== null) {
        clearTimeout(this.offlineTimer);
        this.offlineTimer = null;
      } else {
        // Fire-and-forget — the WS upgrade response should not block on it.
        void this.broadcastPresence(userId, { type: "presence:friend_online", userId });
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── Server-to-server fanout ───────────────────────────────────────────────

  private async handleNotify(request: Request, userId: string): Promise<Response> {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${this.env.GAME_WORKER_SECRET}`) {
      log("auth.failure", { reason: "user_notify_bad_secret", userId });
      return new Response("Unauthorized", { status: 401 });
    }

    // Pass the body through opaquely. T3 defines the event vocabulary; this DO
    // is just a fanout primitive. Preserve the wire frame type by content-type:
    // text frames for JSON / text/*, binary frames for anything else, so a
    // non-UTF-8 binary payload is not silently mojibake'd through TextDecoder.
    const contentType = request.headers.get("Content-Type") ?? "";
    const payload: string | ArrayBuffer
      = contentType.startsWith("application/json") || contentType.startsWith("text/")
        ? await request.text()
        : await request.arrayBuffer();
    this.broadcast(payload);
    return new Response(null, { status: 202 });
  }

  // ─── Health / introspection ────────────────────────────────────────────────

  private handleHealth(request: Request, userId: string): Response {
    // The worker entrypoint already gates this route, but the DO checks too —
    // defense-in-depth, matches GameSession.handleNotifyEnd's pattern.
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${this.env.GAME_WORKER_SECRET}`) {
      log("auth.failure", { reason: "user_health_bad_secret", userId });
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response(JSON.stringify({ connections: this.getConnectionCount() }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── Hibernation handlers ──────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const size = typeof message === "string"
      ? new TextEncoder().encode(message).byteLength
      : message.byteLength;
    if (size > MAX_CLIENT_MESSAGE_BYTES) {
      log("user_channel.message_too_large", { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
      try { ws.close(1009, "message too big"); } catch { /* ignore */ }
      return;
    }
    // No client→server vocabulary in OPT-352; drop and log at debug. T9 is
    // the first ticket to add a typed message handler here.
    log("user_channel.message_dropped", { reason: "no_vocabulary_yet" });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDetach(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDetach(ws);
  }

  async alarm(): Promise<void> {
    if (this.getConnectionCount() === 0) {
      await this.state.storage.deleteAll();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Number of attached sockets per the DO's own bookkeeping. Reads from
   * `getWebSockets()` for an external probe (e.g. `/health` aggregation —
   * worth seeing CLOSING sockets). Internal presence transitions use the
   * stricter `activeConnectionIds` set.
   */
  getConnectionCount(): number {
    return this.state.getWebSockets().length;
  }

  private async handleDetach(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment();
    const userId = isUserSocketAttachment(attachment) ? attachment.userId : null;
    const connectionId = isUserSocketAttachment(attachment) ? attachment.connectionId : null;

    // Remove from the active set BEFORE the size check so the broadcast
    // logic sees the post-detach count. `getWebSockets()` may still report
    // this socket while CLOSING — relying on it would race.
    if (connectionId !== null) {
      this.activeConnectionIds.delete(connectionId);
    }

    // Last socket gone → schedule the offline broadcast. If a new socket
    // attaches within PRESENCE_OFFLINE_DEBOUNCE_MS, handleWebSocket cancels
    // the timer before it fires (multi-tab flicker prevention).
    if (userId !== null && this.activeConnectionIds.size === 0) {
      if (this.offlineTimer !== null) clearTimeout(this.offlineTimer);
      this.offlineTimer = setTimeout(() => {
        this.offlineTimer = null;
        if (this.activeConnectionIds.size !== 0) return;
        void this.fireOfflineBroadcast(userId);
      }, PRESENCE_OFFLINE_DEBOUNCE_MS);
    }

    await this.scheduleIdleReap();
  }

  private async fireOfflineBroadcast(userId: string): Promise<void> {
    const lastSeen = new Date().toISOString();
    // Stamp the DB and event payload with the same `lastSeen` value so the
    // tooltip a recipient sees matches what's persisted (route accepts the
    // string and writes it verbatim). Both calls are best-effort.
    await this.patchLastSeen(userId, lastSeen);
    await this.broadcastPresence(userId, {
      type: "presence:friend_offline",
      userId,
      lastSeen,
    });
  }

  private async broadcastPresence(
    userId: string,
    event:
      | { type: "presence:friend_online"; userId: string }
      | { type: "presence:friend_offline"; userId: string; lastSeen: string },
  ): Promise<void> {
    let friendIds: string[];
    try {
      friendIds = await this.fetchFriends(userId);
    } catch (err) {
      log("user_channel.friends_fetch_failed", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (friendIds.length === 0) return;

    const body = JSON.stringify(event);
    await Promise.allSettled(
      friendIds.map((friendId) => this.notifyFriend(friendId, body)),
    );
  }

  private async notifyFriend(friendId: string, body: string): Promise<void> {
    const stub = this.env.USER_CHANNEL.get(this.env.USER_CHANNEL.idFromName(friendId));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FANOUT_TIMEOUT_MS);
    try {
      await stub.fetch(
        `https://user-channel.internal/user/${encodeURIComponent(friendId)}/notify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.env.GAME_WORKER_SECRET}`,
          },
          body,
          signal: controller.signal,
        },
      );
    } catch (err) {
      log("user_channel.fanout_failed", {
        friendId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchFriends(userId: string): Promise<string[]> {
    const now = Date.now();
    if (this.friendsCache && this.friendsCache.expiresAt > now) {
      return this.friendsCache.ids;
    }

    const url = `${this.env.NEXTJS_URL}/api/realtime/friends-of/${encodeURIComponent(userId)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FANOUT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.env.GAME_WORKER_SECRET}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`friends-of ${res.status}`);
      }
      const body = (await res.json()) as { data?: { friendIds?: unknown } };
      const raw = body.data?.friendIds;
      const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
      this.friendsCache = { ids, expiresAt: now + FRIENDS_CACHE_TTL_MS };
      return ids;
    } finally {
      clearTimeout(timer);
    }
  }

  private async patchLastSeen(userId: string, lastSeen: string): Promise<void> {
    const url = `${this.env.NEXTJS_URL}/api/realtime/users/${encodeURIComponent(userId)}/last-seen`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FANOUT_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.GAME_WORKER_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lastSeen }),
        signal: controller.signal,
      });
    } catch (err) {
      log("user_channel.last_seen_failed", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async scheduleIdleReap(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + IDLE_REAP_AFTER_MS);
  }

  private broadcast(payload: string | ArrayBuffer): void {
    for (const ws of this.state.getWebSockets()) {
      if (!isUserSocketAttachment(ws.deserializeAttachment())) continue;
      try { ws.send(payload); } catch { /* closed */ }
    }
  }
}
