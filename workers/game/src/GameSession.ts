/**
 * GameSession Durable Object
 *
 * One instance per active game. Holds GameState in memory, accepts WebSocket
 * connections from both players, and serializes all incoming actions through
 * the rules engine pipeline.
 */

import type {
  CardData,
  ClientMessage,
  GameAction,
  GameInitPayload,
  GameState,
  ServerMessage,
} from "./types.js";
import { buildInitialState } from "./engine/setup.js";
import { runPipeline } from "./engine/pipeline.js";
import { setPlayerConnected } from "./engine/state.js";

// Stored in DO persistent storage
interface StoredSession {
  state: GameState;
  cardDb: Record<string, CardData>; // serialized as plain object
  mulliganDone: [boolean, boolean];
  reconnectTimer: boolean; // whether alarm is set for a disconnected player
}

export class GameSession implements DurableObject {
  state: DurableObjectState;
  env: Env;

  // In-memory cache (rebuilt from storage on wake)
  private gameState: GameState | null = null;
  private cardDb: Map<string, CardData> | null = null;
  private mulliganDone: [boolean, boolean] = [false, false];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /init — called by Next.js on lobby start
    if (request.method === "POST" && url.pathname.endsWith("/init")) {
      return this.handleInit(request);
    }

    // GET /ws — WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    return new Response("Not found", { status: 404 });
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const payload = await request.json() as GameInitPayload;
    const { state, cardDb } = buildInitialState(payload);

    this.gameState = state;
    this.cardDb = cardDb;
    this.mulliganDone = [false, false];

    // Persist to DO storage so state survives hibernation
    await this.persist();

    return new Response(JSON.stringify({ ok: true, gameId: state.id }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── WebSocket ─────────────────────────────────────────────────────────────

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    // Validate JWT — verify the token belongs to one of the two players
    const playerIndex = await this.validateToken(token);
    if (playerIndex === null) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Ensure game state is loaded
    if (!this.gameState) {
      const loaded = await this.loadFromStorage();
      if (!loaded) return new Response("Game not initialized", { status: 404 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [`player-${playerIndex}`]);

    // Mark player as connected
    this.gameState = setPlayerConnected(this.gameState!, playerIndex as 0 | 1, true);
    await this.persist();

    // Send full game state to connecting client
    this.send(server, { type: "game:state", state: this.gameState! });

    // Cancel reconnect timer if it was running for this player
    // (alarm fires if player doesn't reconnect in time)

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── WebSocket message handler (Hibernation API) ───────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.gameState || !this.cardDb) {
      await this.loadFromStorage();
    }

    const tags = this.state.getTags(ws);
    const playerTag = tags.find((t) => t.startsWith("player-"));
    if (!playerTag) return;
    const playerIndex = parseInt(playerTag.replace("player-", "")) as 0 | 1;

    let clientMsg: ClientMessage;
    try {
      clientMsg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      this.send(ws, { type: "game:error", message: "Invalid message format" });
      return;
    }

    if (clientMsg.type !== "game:action") return;

    await this.handleAction(ws, playerIndex, clientMsg.action);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const tags = this.state.getTags(ws);
    const playerTag = tags.find((t) => t.startsWith("player-"));
    if (!playerTag || !this.gameState) return;

    const playerIndex = parseInt(playerTag.replace("player-", "")) as 0 | 1;
    this.gameState = setPlayerConnected(this.gameState, playerIndex, false);
    await this.persist();

    // Notify opponent
    this.broadcastExcept(ws, {
      type: "game:prompt",
      promptType: "SELECT_BLOCKER", // reusing prompt channel for system messages — TODO: add system:message type
      options: { timeoutMs: 300_000 },
    });

    // Set a 5-minute alarm for forfeit
    await this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
  }

  async alarm(): Promise<void> {
    // 5-minute reconnect timer expired — forfeit the disconnected player
    if (!this.gameState) await this.loadFromStorage();
    if (!this.gameState || this.gameState.status === "FINISHED") return;

    const disconnectedIdx = this.gameState.players[0].connected ? 1 : 0;
    const winner: 0 | 1 = disconnectedIdx === 0 ? 1 : 0;

    this.gameState = {
      ...this.gameState,
      status: "FINISHED",
      winner,
      winReason: `Player ${disconnectedIdx + 1} disconnected`,
    };

    this.broadcast({ type: "game:over", winner, reason: "disconnect forfeit" });
    await this.persist();
    await this.writeResultToDb();
  }

  // ─── Action handling ───────────────────────────────────────────────────────

  private async handleAction(
    ws: WebSocket,
    playerIndex: 0 | 1,
    action: GameAction,
  ): Promise<void> {
    if (!this.gameState || !this.cardDb) return;

    // Only the active player can act, except for: PASS, DECLARE_BLOCKER, USE_COUNTER,
    // USE_COUNTER_EVENT, REVEAL_TRIGGER (which are the inactive/defending player's actions)
    const inactiveActions = new Set([
      "DECLARE_BLOCKER",
      "USE_COUNTER",
      "USE_COUNTER_EVENT",
      "REVEAL_TRIGGER",
      "PASS",
    ]);

    const expectedPlayer = inactiveActions.has(action.type)
      ? (this.gameState.turn.activePlayerIndex === 0 ? 1 : 0)
      : this.gameState.turn.activePlayerIndex;

    if (playerIndex !== expectedPlayer) {
      this.send(ws, { type: "game:error", message: "Not your turn" });
      return;
    }

    const result = runPipeline(this.gameState, action, this.cardDb);

    if (!result.valid) {
      this.send(ws, { type: "game:error", message: result.error ?? "Invalid action" });
      return;
    }

    this.gameState = result.state;
    await this.persist();

    // Broadcast updated state to both players
    this.broadcast({ type: "game:update", action, state: this.gameState });

    if (result.gameOver) {
      this.broadcast({
        type: "game:over",
        winner: result.gameOver.winner,
        reason: result.gameOver.reason,
      });
      await this.writeResultToDb();
      return;
    }

    // Send prompts if a player input is required
    this.sendPendingPrompts();
  }

  private sendPendingPrompts(): void {
    if (!this.gameState) return;
    const { battleSubPhase, battle } = this.gameState.turn;
    const inactiveIdx = this.gameState.turn.activePlayerIndex === 0 ? 1 : 0;

    if (battleSubPhase === "BLOCK_STEP") {
      const inactiveWs = this.getWebSocketForPlayer(inactiveIdx);
      if (inactiveWs) {
        const blockers = this.gameState.players[inactiveIdx].characters
          .filter((c) => c.state === "ACTIVE")
          .map((c) => c.instanceId);
        this.send(inactiveWs, {
          type: "game:prompt",
          promptType: "SELECT_BLOCKER",
          options: { validTargets: blockers, optional: true, timeoutMs: 30_000 },
        });
      }
    } else if (battleSubPhase === "DAMAGE_STEP" && battle && "pendingTriggerLifeCard" in battle) {
      const inactiveWs = this.getWebSocketForPlayer(inactiveIdx);
      if (inactiveWs) {
        this.send(inactiveWs, {
          type: "game:prompt",
          promptType: "REVEAL_TRIGGER",
          options: { optional: false, timeoutMs: 30_000 },
        });
      }
    }
  }

  // ─── Token validation ──────────────────────────────────────────────────────

  private async validateToken(token: string): Promise<0 | 1 | null> {
    if (!this.gameState) {
      const loaded = await this.loadFromStorage();
      if (!loaded) return null;
    }

    const userId = await verifyNextAuthJwt(token, this.env.JWT_SECRET);
    if (!userId) return null;

    const players = this.gameState!.players;
    if (players[0].playerId === userId) return 0;
    if (players[1].playerId === userId) return 1;
    return null;
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    if (!this.gameState || !this.cardDb) return;
    const stored: StoredSession = {
      state: this.gameState,
      cardDb: Object.fromEntries(this.cardDb),
      mulliganDone: this.mulliganDone,
      reconnectTimer: false,
    };
    await this.state.storage.put("session", stored);
  }

  private async loadFromStorage(): Promise<boolean> {
    const stored = await this.state.storage.get<StoredSession>("session");
    if (!stored) return false;

    this.gameState = stored.state;
    this.cardDb = new Map(Object.entries(stored.cardDb));
    this.mulliganDone = stored.mulliganDone;
    return true;
  }

  private async writeResultToDb(): Promise<void> {
    if (!this.gameState) return;
    // POST the result back to the Next.js API so it can update game_sessions in PostgreSQL.
    const body = {
      gameId: this.gameState.id,
      status: this.gameState.status,
      winnerId: this.gameState.winner !== null
        ? this.gameState.players[this.gameState.winner].playerId
        : null,
      winReason: this.gameState.winReason,
    };

    await fetch(`${this.env.NEXTJS_URL}/api/game/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.env.GAME_WORKER_SECRET}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {
      // Non-critical: game result logging. Don't crash the DO on failure.
    });
  }

  // ─── Broadcast helpers ─────────────────────────────────────────────────────

  private broadcast(msg: ServerMessage): void {
    const sockets = this.state.getWebSockets();
    const payload = JSON.stringify(msg);
    for (const ws of sockets) {
      try { ws.send(payload); } catch { /* closed */ }
    }
  }

  private broadcastExcept(exclude: WebSocket, msg: ServerMessage): void {
    const sockets = this.state.getWebSockets();
    const payload = JSON.stringify(msg);
    for (const ws of sockets) {
      if (ws !== exclude) {
        try { ws.send(payload); } catch { /* closed */ }
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }

  private getWebSocketForPlayer(playerIndex: 0 | 1): WebSocket | null {
    const sockets = this.state.getWebSockets(`player-${playerIndex}`);
    return sockets[0] ?? null;
  }
}

// ─── JWT verification (NextAuth v5 / @auth/core) ───────────────────────────
// NextAuth signs tokens with HMAC-SHA512 using AUTH_SECRET as the raw key.
// The `sub` claim contains the user's database ID.

async function verifyNextAuthJwt(token: string, secret: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const keyMaterial = new TextEncoder().encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["verify"],
    );

    const signature = base64urlDecode(signatureB64);
    const data = new TextEncoder().encode(signingInput);
    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));

    // Reject expired tokens
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

interface Env {
  GAME_SESSION: DurableObjectNamespace;
  NEXTJS_URL: string;
  GAME_WORKER_SECRET: string;
  JWT_SECRET: string;
}
