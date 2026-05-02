/**
 * UserChannel Durable Object
 *
 * Per-user fanout channel for cross-player pushes. One DO instance per user,
 * keyed by `env.USER_CHANNEL.idFromName(userId)`. Holds N WebSockets so a
 * user can have multiple tabs open and receive every event on each tab.
 *
 * Server-only scaffold (OPT-352): the worker accepts authenticated upgrades
 * and exposes a `/notify` endpoint, but no client wires up here yet and no
 * event vocabulary is defined. Client→server messages are dropped (logged
 * at debug). T9 is the first ticket to add a client→server message type.
 */

import type { Env } from "./types.js";
import { verifyUserToken } from "./util/auth.js";
import { consumeTokenJti } from "./util/token-replay.js";
import { configureLogger, log } from "./lib/log.js";

const IDLE_REAP_AFTER_MS = 10 * 60 * 1000;
const MAX_CLIENT_MESSAGE_BYTES = 8 * 1024;
const ROUTE_PATTERN = /^\/user\/([^/]+)\/(ws|notify|health)$/;

interface UserSocketAttachment {
  type: "user-channel-socket";
  userId: string;
  connectionId: string;
  attachedAt: number;
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

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    configureLogger(env.LOG_URL);
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
      return this.handleHealth();
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

    // A live socket cancels any pending idle-reap.
    await this.state.storage.deleteAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── Server-to-server fanout ───────────────────────────────────────────────

  private async handleNotify(request: Request, userId: string): Promise<Response> {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${this.env.GAME_WORKER_SECRET}`) {
      log("auth.failure", { reason: "user_notify_bad_secret", userId });
      return new Response("Unauthorized", { status: 401 });
    }

    // Pass the body through opaquely. T3 defines the event vocabulary;
    // this DO is just a fanout primitive.
    const body = await request.text();
    this.broadcast(body);
    return new Response(null, { status: 202 });
  }

  // ─── Health / introspection ────────────────────────────────────────────────

  private handleHealth(): Response {
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

  async webSocketClose(): Promise<void> {
    await this.scheduleIdleReap();
  }

  async webSocketError(): Promise<void> {
    await this.scheduleIdleReap();
  }

  async alarm(): Promise<void> {
    if (this.getConnectionCount() === 0) {
      await this.state.storage.deleteAll();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Public surface for OPT-358 presence work. */
  getConnectionCount(): number {
    return this.state.getWebSockets().length;
  }

  private async scheduleIdleReap(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + IDLE_REAP_AFTER_MS);
  }

  private broadcast(payload: string): void {
    for (const ws of this.state.getWebSockets()) {
      if (!isUserSocketAttachment(ws.deserializeAttachment())) continue;
      try { ws.send(payload); } catch { /* closed */ }
    }
  }
}
