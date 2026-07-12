/**
 * GameSession Durable Object
 *
 * One instance per active game. Holds GameState in memory, accepts WebSocket
 * connections from both players, and serializes all incoming actions through
 * the rules engine pipeline.
 */

import type {
  BattleContext,
  CardData,
  ClientMessage,
  DonInstance,
  Env,
  GameAction,
  GameInitPayload,
  GameState,
  LobbyMode,
  LifeCard,
  ServerMessage,
  PendingPromptState,
  PromptType,
  ResumeContext,
  EffectStackFrame,
} from "./types.js";

type DurablePromptType = Extract<
  PromptType,
  | "SELECT_TARGET"
  | "ARRANGE_TOP_CARDS"
  | "REDISTRIBUTE_DON"
  | "PLAYER_CHOICE"
  | "OPTIONAL_EFFECT"
  | "REVEAL_TRIGGER"
>;

type ResumedGameOver = { winner: 0 | 1 | null; reason: string };

// OPT-436: only these action types may answer each durable prompt. Keeping
// PASS prompt-specific prevents mandatory prompts from being skipped.
const EXPECTED_RESPONSE_TYPES: Record<DurablePromptType, ReadonlyArray<GameAction["type"]>> = {
  SELECT_TARGET: ["SELECT_TARGET"],
  ARRANGE_TOP_CARDS: ["ARRANGE_TOP_CARDS"],
  REDISTRIBUTE_DON: ["REDISTRIBUTE_DON"],
  PLAYER_CHOICE: ["PLAYER_CHOICE"],
  OPTIONAL_EFFECT: ["PLAYER_CHOICE", "PASS"],
  REVEAL_TRIGGER: ["REVEAL_TRIGGER"],
};

function promptResponseId(action: GameAction): string | undefined {
  return "promptId" in action ? action.promptId : undefined;
}

/**
 * OPT-446: PASS and PLAYER_CHOICE "skip" are the engine's shared decline
 * vocabulary (resume/choice.ts). Replacement resume paths must treat them
 * identically — deriving acceptance from `type !== "PASS"` alone would turn
 * a "skip" decline into an accept and apply the replacement.
 */
function isDeclineResponse(action: GameAction): boolean {
  return action.type === "PASS"
    || (action.type === "PLAYER_CHOICE" && action.choiceId === "skip");
}

/**
 * Treat an ARRANGE response as an exact partition of the cards the server
 * revealed. This prevents clients from omitting, duplicating, or injecting
 * instance IDs and gives [] validTargets its intended meaning: pick nothing.
 */
function validateArrangeResponse(
  prompt: Extract<PendingPromptState["options"], { promptType: "ARRANGE_TOP_CARDS" }>,
  action: Extract<GameAction, { type: "ARRANGE_TOP_CARDS" }>,
): string | null {
  const revealedIds = prompt.cards.map((card) => card.instanceId);
  const revealed = new Set(revealedIds);
  const requestedKept = action.keptCardInstanceIds?.length
    ? action.keptCardInstanceIds
    : action.keptCardInstanceId
      ? [action.keptCardInstanceId]
      : [];
  const kept = new Set(requestedKept);
  const ordered = new Set(action.orderedInstanceIds);

  if (kept.size !== requestedKept.length || ordered.size !== action.orderedInstanceIds.length) {
    return "Arrangement contains duplicate cards";
  }
  if (
    requestedKept.some((id) => !revealed.has(id)) ||
    action.orderedInstanceIds.some((id) => !revealed.has(id))
  ) {
    return "Arrangement contains a card that was not revealed";
  }
  if (requestedKept.some((id) => ordered.has(id))) {
    return "A card cannot be both kept and arranged";
  }

  const validPicks = prompt.validTargets === undefined ? revealed : new Set(prompt.validTargets);
  if (requestedKept.some((id) => !validPicks.has(id))) {
    return "That card is not a valid pick";
  }
  if (requestedKept.length > (prompt.maxKeep ?? 1)) {
    return "Too many cards were selected";
  }
  if (
    kept.size + ordered.size !== revealed.size ||
    revealedIds.some((id) => !kept.has(id) && !ordered.has(id))
  ) {
    return "Arrangement must include every revealed card exactly once";
  }

  return null;
}
import { prepareDecksAndLeaders } from "./engine/setup.js";
import {
  advancePregame,
  defaultPregameRng,
  resumePregameFromPrompt,
  startPregame,
} from "./engine/pregame.js";
import { continuePipelineFromExecution, runPipeline } from "./engine/pipeline.js";
import {
  continueReplacementBatchAfterSubstitute,
  resumeReplacement,
  resumeReplacementBatch,
  type BatchResumeResult,
  type ReplacementBatchResumeContext,
  type ReplacementResumeContext,
} from "./engine/replacements.js";
import { filterStateForPlayer, setPlayerConnected } from "./engine/state.js";
import { filterPromptOptionsForPlayer } from "./engine/visibility.js";
import { verifyGameToken } from "./util/auth.js";
import { CONSUMED_TOKEN_JTIS_STORAGE_KEY, consumeTokenJti } from "./util/token-replay.js";
import { validateGameInitPayload, validateClientMessage, validateNotifyEndPayload } from "./util/validate.js";
import { buildGameResultCallbackPayload } from "./util/result.js";
import { isStartOfTurnAutoPhase } from "./engine/phases.js";
import { resumeEffectChain, resumeFromStack } from "./engine/effect-resolver/index.js";
import { abortReplacedCost } from "./engine/effect-resolver/resume/cost.js";
import { recalculateBattlePowers, resumeBattleDamageContinuation } from "./engine/battle.js";
import { isEffectConditionMet } from "./engine/modifiers.js";
import type { RuntimeActiveEffect } from "./engine/effect-types.js";
import { configureLogger, log } from "./lib/log.js";

const REJOIN_WINDOW_MS = 5 * 60 * 1000;
export const MAX_CLIENT_MESSAGE_BYTES = 8 * 1024;
export const ACTION_RATE_LIMIT_BURST = 24;
export const ACTION_RATE_LIMIT_REFILL_PER_SECOND = 8;
export const INVALID_MESSAGE_RATE_LIMIT_BURST = 6;
export const INVALID_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND = 1;
export const UPGRADE_RATE_LIMIT_BURST = 6;
export const UPGRADE_RATE_LIMIT_REFILL_PER_SECOND = 0.2;
export const RATE_LIMIT_CLOSE_CODE = 1008;
export const ACTION_RATE_LIMIT_CLOSE_REASON = "action rate limit exceeded";
export const INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON = "message rate limit exceeded";
export const UPGRADE_RATE_LIMIT_RESPONSE_BODY = "Too many reconnect attempts";
const SUPERSEDED_SOCKET_CLOSE_CODE = 1000;
const SUPERSEDED_SOCKET_CLOSE_REASON = "superseded";

// Debounce DISCONNECTED broadcasts so a quick supersede / mid-handshake race /
// short network hiccup does not surface OPPONENT AWAY before the client gets
// a chance to attach a replacement socket. 500ms covers Strict Mode supersede
// races (typically <50ms) and short hiccups while staying well under the
// existing ~5min rejoin window.
export const DISCONNECT_BROADCAST_DEBOUNCE_MS = 500;

interface PlayerSocketAttachment {
  type: "game-session-player-socket";
  playerIndex: 0 | 1;
  connectionId: string;
  acceptedAt: number;
}

interface TokenBucket {
  tokens: number;
  updatedAt: number;
}

export function getClientMessageByteLength(message: string | ArrayBuffer): number {
  if (typeof message !== "string") return message.byteLength;
  return new TextEncoder().encode(message).byteLength;
}

export function consumeTokenBucket(
  bucket: TokenBucket | undefined,
  now: number,
  capacity: number,
  refillPerSecond: number,
): { allowed: boolean; bucket: TokenBucket } {
  const current = bucket ?? { tokens: capacity, updatedAt: now };
  const elapsedSeconds = Math.max(0, now - current.updatedAt) / 1000;
  const tokens = Math.min(capacity, current.tokens + elapsedSeconds * refillPerSecond);
  if (tokens < 1) {
    return { allowed: false, bucket: { tokens, updatedAt: now } };
  }
  return { allowed: true, bucket: { tokens: tokens - 1, updatedAt: now } };
}

export function getTokenBucketRetryAfterSeconds(
  bucket: TokenBucket,
  capacity: number,
  refillPerSecond: number,
): number {
  if (bucket.tokens >= 1) return 0;
  if (refillPerSecond <= 0) return 1;
  return Math.max(1, Math.ceil((1 - Math.min(capacity, bucket.tokens)) / refillPerSecond));
}

function isPlayerSocketAttachment(value: unknown): value is PlayerSocketAttachment {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<PlayerSocketAttachment>;
  return candidate.type === "game-session-player-socket"
    && (candidate.playerIndex === 0 || candidate.playerIndex === 1)
    && typeof candidate.connectionId === "string"
    && typeof candidate.acceptedAt === "number";
}

function getPlayerSocketAttachment(ws: WebSocket): PlayerSocketAttachment | null {
  try {
    const attachment = ws.deserializeAttachment();
    return isPlayerSocketAttachment(attachment) ? attachment : null;
  } catch {
    return null;
  }
}

// Stored in DO persistent storage
interface StoredSession {
  state: GameState;
  cardDb: Record<string, CardData>; // serialized as plain object
  /**
   * OPT-366: legacy field — mulligan state now lives on
   * `state.pregame.mulliganDecisions` and persists with the GameState. Kept
   * here for backward compatibility on existing in-flight DOs and read with
   * a `?? [false, false]` default.
   */
  mulliganDone?: [boolean, boolean];
  mode?: LobbyMode;
  /** OPT-366: deterministic priority-roll sequence for tests; persisted so it
   *  survives DO hibernation between phases (currently consumed in one shot
   *  by `advancePregame`, but persisted for future per-phase rerolls). */
  testPriorityRolls?: number[] | null;
  undoHistory?: GameState[]; // snapshot stack for undo (v1: max depth 1)
}

export class GameSession implements DurableObject {
  state: DurableObjectState;
  env: Env;

  // In-memory cache (rebuilt from storage on wake)
  private gameState: GameState | null = null;
  private gameMode: LobbyMode = "PVP";
  private cardDb: Map<string, CardData> | null = null;
  private undoHistory: GameState[] = [];
  /** OPT-366: deterministic priority-roll sequence (test-only). */
  private testPriorityRolls: number[] | null = null;
  private nextWebSocketSequence = 0;
  private readonly actionRateLimitBuckets = new Map<string, TokenBucket>();
  private readonly invalidMessageRateLimitBuckets = new Map<string, TokenBucket>();
  private readonly upgradeRateLimitBuckets = new Map<string, TokenBucket>();
  private readonly pendingDisconnectTimers = new Map<0 | 1, ReturnType<typeof setTimeout>>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    configureLogger(env.LOG_URL);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /init — called by Next.js on lobby start
    if (request.method === "POST" && url.pathname.endsWith("/init")) {
      return this.handleInit(request);
    }

    // POST /notify-end — DB already updated (e.g. API fallback concede); sync DO + notify clients
    if (request.method === "POST" && url.pathname.endsWith("/notify-end")) {
      return this.handleNotifyEnd(request);
    }

    // GET /ws — WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    // GET /cards — return card DB (auth via game token)
    if (request.method === "GET" && url.pathname.endsWith("/cards")) {
      return this.handleGetCards(request);
    }

    return new Response("Not found", { status: 404 });
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    let payload: GameInitPayload;
    try {
      payload = validateGameInitPayload(await request.json());
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Invalid payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { state: prepared, cardDb } = prepareDecksAndLeaders(payload);

    this.cardDb = cardDb;
    this.gameMode = payload.mode;
    this.testPriorityRolls = payload.testPriorityRolls ?? null;

    // OPT-366: enter the pregame state machine — priority decision (2d6),
    // first-or-second prompt, start-of-game effects (OPT-365), hand deal,
    // mulligan decisions, life placement — before the first player's REFRESH.
    const initial = startPregame(prepared);
    this.gameState = this.drainPregame(initial);

    // Persist to DO storage so state survives hibernation
    await this.persist();
    await this.state.storage.put(CONSUMED_TOKEN_JTIS_STORAGE_KEY, {});

    return new Response(JSON.stringify({ ok: true, gameId: prepared.id }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * OPT-366: drive `advancePregame` until it pauses for a prompt or finishes.
   * When the FSM finishes, run the first player's start-of-turn auto-phases
   * (REFRESH → DRAW → DON → MAIN) so they land at MAIN exactly as before.
   */
  private drainPregame(state: GameState): GameState {
    if (!this.cardDb) return state;
    const result = advancePregame(
      state,
      this.cardDb,
      this.testPriorityRolls,
      defaultPregameRng(),
    );
    if (!result.done) return result.state;
    // FSM drained — run normal start-of-turn auto-phases for the first player.
    return this.runStartOfTurnAutoPhases(result.state);
  }

  /** Called from Next.js after a game is finished in Postgres (e.g. disconnected concede). */
  private async handleNotifyEnd(request: Request): Promise<Response> {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${this.env.GAME_WORKER_SECRET}`) {
      log("auth.failure", { reason: "notify_end_bad_secret", gameId: this.gameState?.id });
      return new Response("Unauthorized", { status: 401 });
    }

    let body: { winnerIndex: 0 | 1; reason: string };
    try {
      body = validateNotifyEndPayload(await request.json());
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const { winnerIndex, reason } = body;

    if (!this.gameState) {
      const loaded = await this.loadFromStorage();
      if (!loaded) return new Response("Game not initialized", { status: 404 });
    }

    if (this.gameState!.status !== "IN_PROGRESS") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    this.gameState = {
      ...this.gameState!,
      status: "FINISHED",
      winner: winnerIndex as 0 | 1,
      winReason: reason,
      pendingPrompt: null,
      effectStack: [],
    };
    await this.persist();

    this.broadcast({ type: "game:over", winner: winnerIndex as 0 | 1, reason });
    this.broadcastFilteredState((s) => ({ type: "game:state", state: s }));
    await this.writeResultToDb();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ─── Card DB ────────────────────────────────────────────────────────────────

  private async handleGetCards(request: Request): Promise<Response> {
    const corsHeaders = { "Access-Control-Allow-Origin": this.env.NEXTJS_URL };

    if (!this.cardDb || !this.gameState) {
      const loaded = await this.loadFromStorage();
      if (!loaded) return new Response("Game not initialized", { status: 404, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) return new Response("Missing token", { status: 401, headers: corsHeaders });
    const playerIndex = await this.validateToken(token);
    if (playerIndex === null) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    return new Response(JSON.stringify(Object.fromEntries(this.cardDb!)), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  // ─── WebSocket ─────────────────────────────────────────────────────────────

  private async handleWebSocket(request: Request): Promise<Response> {
    if (!this.gameState) {
      const loaded = await this.loadFromStorage();
      if (!loaded) return new Response("Game not initialized", { status: 404 });
    }

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

    const upgradeBudget = this.consumeUpgradeBudget(playerIndex);
    if (!upgradeBudget.allowed) {
      return new Response(UPGRADE_RATE_LIMIT_RESPONSE_BODY, {
        status: 429,
        headers: {
          "Retry-After": String(upgradeBudget.retryAfterSeconds),
        },
      });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.acceptAuthoritativePlayerSocket(playerIndex as 0 | 1, server);

    // Mark player as connected
    this.gameState = this.setPlayerPresence(this.gameState!, playerIndex as 0 | 1, {
      connected: true,
      awayReason: null,
      rejoinDeadlineAt: null,
    });
    await this.persist();
    await this.syncAlarm();

    // Broadcast updated game state to ALL connected players (including the new socket).
    // This is the only reliable way to keep the `connected` flags in sync on both clients.
    // If we only send game:state to the connecting player, the opponent's client will never
    // learn that this player's connected flag changed to true.
    this.broadcastFilteredState((s) => ({ type: "game:state", state: s }));
    this.broadcast({ type: "game:player_reconnected", playerIndex });

    // Re-send pending prompt to the reconnecting player if they need to respond
    if (
      this.gameState!.status === "IN_PROGRESS"
      && this.gameState!.pendingPrompt?.respondingPlayer === playerIndex
    ) {
      const playerWs = this.getWebSocketForPlayer(playerIndex as 0 | 1);
      if (playerWs) {
        this.send(playerWs, {
          type: "game:prompt",
          promptId: this.gameState!.pendingPrompt.promptId,
          options: filterPromptOptionsForPlayer(this.gameState!.pendingPrompt.options),
        });
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── WebSocket message handler (Hibernation API) ───────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (getClientMessageByteLength(message) > MAX_CLIENT_MESSAGE_BYTES) {
      log("ws.message_too_large", { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
      try { ws.close(1009, "message too big"); } catch { /* ignore */ }
      return;
    }

    if (!this.gameState || !this.cardDb) {
      await this.loadFromStorage();
    }

    const tags = this.state.getTags(ws);
    const playerTag = tags.find((t) => t.startsWith("player-"));
    if (!playerTag) return;
    const parsed = parseInt(playerTag.replace("player-", ""));
    if (parsed !== 0 && parsed !== 1) return;
    const playerIndex = parsed as 0 | 1;
    if (!this.isAuthoritativePlayerSocket(ws, playerIndex)) {
      try { ws.close(SUPERSEDED_SOCKET_CLOSE_CODE, SUPERSEDED_SOCKET_CLOSE_REASON); } catch { /* ignore */ }
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      if (!this.consumeInvalidMessageBudget(playerIndex)) return;
      this.send(ws, { type: "game:error", message: "Invalid message format" });
      return;
    }

    const rawType = typeof raw === "object" && raw !== null
      ? (raw as { type?: unknown }).type
      : undefined;

    // Leave stays available; action-shaped messages spend gameplay budget before Zod validation.
    // Unknown or malformed envelopes spend a smaller abuse budget.
    if (rawType === "game:action" && !this.consumeActionBudget(playerIndex)) return;
    if (rawType !== "game:action" && rawType !== "game:leave" && !this.consumeInvalidMessageBudget(playerIndex)) return;

    let clientMsg: ClientMessage;
    try {
      clientMsg = validateClientMessage(raw);
    } catch {
      this.send(ws, { type: "game:error", message: "Invalid message format" });
      return;
    }

    if (clientMsg.type === "game:leave") {
      if (this.gameState?.pregame) {
        await this.handlePregameLeave(playerIndex);
        try { ws.close(1000, "left"); } catch { /* ignore */ }
        return;
      }
      await this.handlePlayerAway(playerIndex, "LEFT", ws);
      try { ws.close(1000, "left"); } catch { /* ignore */ }
      return;
    }

    if (clientMsg.type === "game:action") {
      await this.handleAction(ws, playerIndex, clientMsg.action);
    }
  }

  private getPlayerBucketKey(playerIndex: 0 | 1): string {
    return `${this.gameState?.id ?? "unknown"}:${playerIndex}`;
  }

  private consumeActionBudget(playerIndex: 0 | 1): boolean {
    const key = this.getPlayerBucketKey(playerIndex);
    const result = consumeTokenBucket(
      this.actionRateLimitBuckets.get(key),
      Date.now(),
      ACTION_RATE_LIMIT_BURST,
      ACTION_RATE_LIMIT_REFILL_PER_SECOND,
    );
    this.actionRateLimitBuckets.set(key, result.bucket);
    if (result.allowed) return true;

    log("ws.action_rate_limited", { gameId: this.gameState?.id, playerIndex });
    const ws = this.getWebSocketForPlayer(playerIndex);
    if (ws) {
      this.send(ws, { type: "game:error", message: ACTION_RATE_LIMIT_CLOSE_REASON });
      try { ws.close(RATE_LIMIT_CLOSE_CODE, ACTION_RATE_LIMIT_CLOSE_REASON); } catch { /* ignore */ }
    }
    return false;
  }

  private consumeInvalidMessageBudget(playerIndex: 0 | 1): boolean {
    const key = this.getPlayerBucketKey(playerIndex);
    const result = consumeTokenBucket(
      this.invalidMessageRateLimitBuckets.get(key),
      Date.now(),
      INVALID_MESSAGE_RATE_LIMIT_BURST,
      INVALID_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND,
    );
    this.invalidMessageRateLimitBuckets.set(key, result.bucket);
    if (result.allowed) return true;

    log("ws.invalid_message_rate_limited", { gameId: this.gameState?.id, playerIndex });
    const ws = this.getWebSocketForPlayer(playerIndex);
    if (ws) {
      this.send(ws, { type: "game:error", message: INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON });
      try { ws.close(RATE_LIMIT_CLOSE_CODE, INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON); } catch { /* ignore */ }
    }
    return false;
  }

  private consumeUpgradeBudget(playerIndex: 0 | 1): { allowed: boolean; retryAfterSeconds: number } {
    const key = this.getPlayerBucketKey(playerIndex);
    const result = consumeTokenBucket(
      this.upgradeRateLimitBuckets.get(key),
      Date.now(),
      UPGRADE_RATE_LIMIT_BURST,
      UPGRADE_RATE_LIMIT_REFILL_PER_SECOND,
    );
    this.upgradeRateLimitBuckets.set(key, result.bucket);
    if (result.allowed) return { allowed: true, retryAfterSeconds: 0 };

    const retryAfterSeconds = getTokenBucketRetryAfterSeconds(
      result.bucket,
      UPGRADE_RATE_LIMIT_BURST,
      UPGRADE_RATE_LIMIT_REFILL_PER_SECOND,
    );
    log("ws.upgrade_rate_limited", {
      gameId: this.gameState?.id,
      playerIndex,
      retryAfterSeconds,
    });
    return { allowed: false, retryAfterSeconds };
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    void code;
    void reason;

    if (!this.gameState) {
      await this.loadFromStorage();
    }

    const tags = this.state.getTags(ws);
    const playerTag = tags.find((t) => t.startsWith("player-"));
    if (!playerTag || !this.gameState) return;

    const parsed = parseInt(playerTag.replace("player-", ""));
    if (parsed !== 0 && parsed !== 1) return;
    const playerIndex = parsed as 0 | 1;
    if (!this.isAuthoritativePlayerSocket(ws, playerIndex)) return;
    if (!this.gameState.players[playerIndex].connected) return;
    this.scheduleDisconnectBroadcast(playerIndex);
  }

  private scheduleDisconnectBroadcast(playerIndex: 0 | 1): void {
    this.cancelPendingDisconnect(playerIndex);
    const timer = setTimeout(() => {
      this.pendingDisconnectTimers.delete(playerIndex);
      void this.handlePlayerAway(playerIndex, "DISCONNECTED");
    }, DISCONNECT_BROADCAST_DEBOUNCE_MS);
    this.pendingDisconnectTimers.set(playerIndex, timer);
  }

  private cancelPendingDisconnect(playerIndex: 0 | 1): void {
    const existing = this.pendingDisconnectTimers.get(playerIndex);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.pendingDisconnectTimers.delete(playerIndex);
    }
  }

  async alarm(): Promise<void> {
    if (!this.gameState) await this.loadFromStorage();
    if (!this.gameState || this.gameState.status !== "IN_PROGRESS") return;

    const now = Date.now();
    const expiredPlayers = ([0, 1] as const).filter((playerIndex) => {
      const player = this.gameState!.players[playerIndex];
      return !player.connected && player.rejoinDeadlineAt !== null && player.rejoinDeadlineAt <= now;
    });

    if (expiredPlayers.length === 0) {
      await this.syncAlarm();
      return;
    }

    let winner: 0 | 1 | null = null;
    let status: "FINISHED" | "ABANDONED" = "FINISHED";
    let reason = "";

    if (expiredPlayers.length === 2) {
      status = "ABANDONED";
      reason = "Both players failed to rejoin in time";
    } else {
      const awayPlayer = expiredPlayers[0];
      const otherPlayer = awayPlayer === 0 ? 1 : 0;
      if (this.gameState.players[otherPlayer].connected) {
        winner = otherPlayer;
        reason = `Player ${awayPlayer + 1} failed to rejoin in time`;
      } else {
        status = "ABANDONED";
        reason = "Rejoin window expired while both players were away";
      }
    }

    this.gameState = {
      ...this.gameState,
      status,
      winner,
      winReason: reason,
      pendingPrompt: null,
      effectStack: [],
    };

    await this.persist();
    await this.writeResultToDb();
    this.broadcast({ type: "game:over", winner, reason });
    await this.syncAlarm();
  }

  // ─── Action handling ───────────────────────────────────────────────────────

  private async handleAction(
    ws: WebSocket,
    playerIndex: 0 | 1,
    action: GameAction,
  ): Promise<void> {
    if (!this.gameState || !this.cardDb) return;

    if (this.gameState.status === "FINISHED" || this.gameState.status === "ABANDONED") {
      this.send(ws, { type: "game:error", message: "Game is already over" });
      return;
    }

    // ── Undo: bypass pipeline entirely ──────────────────────────────────────
    if (action.type === "UNDO") {
      if (!this.canUndo(playerIndex)) {
        this.send(ws, { type: "game:error", message: "Cannot undo right now" });
        return;
      }
      this.gameState = this.undoHistory.pop()!;
      await this.persist();
      this.broadcastFilteredState((s) => ({
        type: "game:state", state: s, canUndo: this.canUndo(playerIndex),
      }));
      this.broadcast({ type: "game:undo", playerIndex, canUndo: this.canUndo(playerIndex) });
      return;
    }

    const pauseReason = this.getPauseReason(playerIndex);
    if (pauseReason && action.type !== "CONCEDE") {
      this.send(ws, { type: "game:error", message: pauseReason });
      return;
    }

    // A prompt-identified action can only answer the prompt that issued that
    // identity. Once the prompt has cleared, accepting the same payload as a
    // normal game action would turn network retries into a second mutation
    // (notably a duplicate PASS advancing BLOCK_STEP).
    if (!this.gameState.pendingPrompt && promptResponseId(action)) {
      this.send(ws, { type: "game:error", message: "That prompt response is stale" });
      return;
    }

    // If an effect is awaiting player input, only allow prompt responses
    if (this.gameState.pendingPrompt) {
      const prompt = this.gameState.pendingPrompt;
      const promptType = prompt.options.promptType;
      const expected = promptType in EXPECTED_RESPONSE_TYPES
        ? EXPECTED_RESPONSE_TYPES[promptType as DurablePromptType]
        : null;

      if (action.type === "CONCEDE") {
        // A player may always concede, including while either player owns a prompt.
        // Fall through to the normal pipeline path below.
      } else if (expected) {
        if (playerIndex !== this.gameState.pendingPrompt.respondingPlayer) {
          this.send(ws, { type: "game:error", message: "Waiting for opponent to respond to prompt" });
          return;
        }
        if (!expected.includes(action.type)) {
          this.send(ws, {
            type: "game:error",
            message: `Expected a ${promptType} response`,
          });
          return;
        }

        if (prompt.promptId && promptResponseId(action) !== prompt.promptId) {
          this.send(ws, {
            type: "game:error",
            message: "That prompt response is stale",
          });
          return;
        }

        if (promptType === "ARRANGE_TOP_CARDS" && action.type === "ARRANGE_TOP_CARDS") {
          const arrangeError = validateArrangeResponse(prompt.options, action);
          if (arrangeError) {
            this.send(ws, { type: "game:error", message: arrangeError });
            return;
          }
        }

        if (promptType === "PLAYER_CHOICE" && action.type === "PLAYER_CHOICE") {
          const offered = prompt.options.choices.some((choice) => choice.id === action.choiceId);
          if (!offered) {
            this.send(ws, { type: "game:error", message: "That choice is no longer available" });
            return;
          }
        }
        if (promptType === "OPTIONAL_EFFECT" && action.type === "PLAYER_CHOICE") {
          // OPT-446: "skip" is the engine's documented decline vocabulary
          // (resume/choice.ts) — the gate must not lock out clients that use
          // it instead of PASS.
          const validChoice = action.choiceId === "activate" || action.choiceId === "accept"
            || action.choiceId === "skip";
          if (!validChoice) {
            this.send(ws, { type: "game:error", message: "That choice is no longer available" });
            return;
          }
        }

        // REVEAL_TRIGGER is a fire-through prompt: clear it and let the action
        // proceed through the normal pipeline so executeRevealTrigger runs.
        if (action.type === "REVEAL_TRIGGER") {
          this.gameState = { ...this.gameState, pendingPrompt: null };
        } else {
          await this.resumeFromPrompt(ws, playerIndex, action);
          return;
        }
      } else {
        this.send(ws, { type: "game:error", message: "Waiting for player to respond to prompt" });
        return;
      }
    }

    // CONCEDE is allowed even while "paused" for opponent away — player may always resign.
    if (action.type !== "CONCEDE") {
      // Only the active player can act, except for: PASS, DECLARE_BLOCKER, USE_COUNTER,
      // USE_COUNTER_EVENT, REVEAL_TRIGGER (which are the inactive/defending player's actions)
      const inactiveActions = new Set([
        "DECLARE_BLOCKER",
        "USE_COUNTER",
        "USE_COUNTER_EVENT",
        "REVEAL_TRIGGER",
        "PASS",
      ]);

      let expectedPlayer: 0 | 1 = inactiveActions.has(action.type)
        ? (this.gameState.turn.activePlayerIndex === 0 ? 1 : 0)
        : this.gameState.turn.activePlayerIndex;

      // OPT-259 (F6): effect-sourced damage can open a [Trigger] window where
      // the damaged player is the controller/active player (e.g. an opponent's
      // ON_KO OPPONENT_TURN trigger dealing damage back at the attacker). The
      // damaged player is the authoritative responder.
      if (action.type === "REVEAL_TRIGGER" && this.gameState.turn.pendingTriggerFromEffect) {
        expectedPlayer = this.gameState.turn.pendingTriggerFromEffect.damagedPlayerIndex;
      }

      if (playerIndex !== expectedPlayer) {
        this.send(ws, { type: "game:error", message: "Not your turn" });
        return;
      }
    }

    // ── Undo history: snapshot before undoable main-phase actions ────────────
    const undoableActions = new Set([
      "PLAY_CARD", "ATTACH_DON", "ACTIVATE_EFFECT", "ADVANCE_PHASE",
    ]);
    if (undoableActions.has(action.type)) {
      // Keep max 1 snapshot for v1
      this.undoHistory = [this.gameState];
    } else {
      // Non-undoable actions (battle, concede, etc.) invalidate the undo stack
      this.undoHistory = [];
    }

    let result = runPipeline(this.gameState, action, this.cardDb, playerIndex);

    if (!result.valid) {
      // Restore undo history — pipeline rejected the action, nothing changed
      this.undoHistory = [];
      this.send(ws, { type: "game:error", message: result.error ?? "Invalid action" });
      return;
    }

    // Auto-advance through REFRESH → DRAW → DON phases without player input.
    // When M4 adds "start of turn" effects that need a choice,
    // isStartOfTurnAutoPhase() should return false to pause here.
    if (!result.gameOver) {
      result = { ...result, state: this.runStartOfTurnAutoPhases(result.state) };
    }

    this.gameState = result.state;

    // Clear undo if the action resulted in a pending prompt (effect needs player input)
    // or if the turn changed (ADVANCE_PHASE past END triggers turn change)
    if (this.gameState.pendingPrompt || this.gameState.effectStack.length > 0) {
      this.undoHistory = [];
    }

    // Surface REVEAL_TRIGGER as a durable prompt before persisting
    this.surfaceRevealTriggerIfNeeded();

    await this.persist();

    // Persist result to Postgres before any broadcast that lets clients leave for /lobbies;
    // otherwise GET /api/game/active can still see IN_PROGRESS and block new games.
    if (result.gameOver) {
      this.undoHistory = [];
      await this.writeResultToDb();
      this.broadcastFilteredState((s) => ({ type: "game:update", action, state: s, canUndo: false }));
      this.broadcast({
        type: "game:over",
        winner: result.gameOver.winner,
        reason: result.gameOver.reason,
      });
      return;
    }

    const canUndoNow = this.undoHistory.length > 0
      && !this.gameState.pendingPrompt
      && this.gameState.effectStack.length === 0
      && !this.gameState.turn.battleSubPhase;
    this.broadcastFilteredState((s) => ({ type: "game:update", action, state: s, canUndo: canUndoNow }));

    // Send prompts if a player input is required
    if (this.gameState.pendingPrompt) {
      this.sendEffectPrompt(this.gameState.pendingPrompt);
    } else {
      this.sendPendingPrompts();
    }
  }

  /**
   * Advance through REFRESH → DRAW → DON → MAIN automatically.
   * Called after init and after each successful action.
   * Returns the state once it reaches a phase that needs player input (MAIN or battle).
   */
  private runStartOfTurnAutoPhases(state: GameState): GameState {
    if (!this.cardDb) return state;
    let current = state;
    while (current.status === "IN_PROGRESS" && isStartOfTurnAutoPhase(current)) {
      const result = runPipeline(
        current,
        { type: "ADVANCE_PHASE" },
        this.cardDb,
        current.turn.activePlayerIndex,
      );
      if (!result.valid) break;
      current = result.state;
    }
    return current;
  }

  private async resumeFromPrompt(
    ws: WebSocket,
    _playerIndex: 0 | 1,
    action: GameAction,
  ): Promise<void> {
    if (!this.gameState || !this.cardDb) return;

    // Effect resolution means game state has progressed — undo no longer valid
    this.undoHistory = [];

    const prompt = this.gameState.pendingPrompt!;
    const stateBeforeResume = this.gameState;
    let responseRejected = false;
    const resumeCtx = prompt.resumeContext as unknown as Record<string, unknown>;
    const respondingPlayer = prompt.respondingPlayer;
    let resumedGameOver: { winner: 0 | 1 | null; reason: string } | undefined;

    // OPT-366: pregame prompts (priority choice, mulligan) drain through the
    // pregame FSM rather than the effect resolver / replacement system.
    if (
      resumeCtx?.type === "PREGAME_PRIORITY_CHOICE"
      || resumeCtx?.type === "PREGAME_MULLIGAN"
    ) {
      this.gameState = resumePregameFromPrompt(this.gameState, action, respondingPlayer);
      this.gameState = this.drainPregame(this.gameState);

      this.surfaceRevealTriggerIfNeeded();
      await this.persist();
      this.broadcastFilteredState((s) => ({ type: "game:update", action, state: s }));
      if (this.gameState.pendingPrompt) {
        this.sendEffectPrompt(this.gameState.pendingPrompt);
      } else {
        this.sendPendingPrompts();
      }
      return;
    }

    // Clear the pending prompt before resuming
    this.gameState = { ...this.gameState, pendingPrompt: null };

    // Route to the appropriate resume handler based on context type
    if (resumeCtx?.type === "REPLACEMENT") {
      const accepted = !isDeclineResponse(action);
      const replacementResult = resumeReplacement(
        this.gameState,
        resumeCtx as unknown as ReplacementResumeContext,
        accepted,
        this.cardDb,
      );
      this.gameState = replacementResult.state;
      const costFrame = this.gameState.effectStack.at(-1) as unknown as EffectStackFrame | undefined;
      if (costFrame?.costReplacementAction) {
        if (replacementResult.replaced) {
          const aborted = abortReplacedCost(
            this.gameState, costFrame, replacementResult.events, this.cardDb,
          );
          this.gameState = aborted.state;
          if (aborted.pendingPrompt) {
            this.gameState = { ...this.gameState, pendingPrompt: aborted.pendingPrompt };
          }
        } else {
          const resumed = resumeFromStack(this.gameState, {
            ...costFrame.costReplacementAction,
          } as GameAction, this.cardDb);
          this.gameState = resumed.state;
          if (resumed.pendingPrompt) {
            this.gameState = { ...this.gameState, pendingPrompt: resumed.pendingPrompt };
          }
        }
      } else {
        this.recordReplacementContinuationResult(!replacementResult.replaced, []);
      }

      if (replacementResult.pendingPrompt) {
        this.gameState = { ...this.gameState, pendingPrompt: replacementResult.pendingPrompt };
      } else {
        resumedGameOver = this.resumeInterruptedEffectContinuations(action) ?? resumedGameOver;
      }
    } else if (resumeCtx?.type === "REPLACEMENT_BATCH") {
      const accepted = !isDeclineResponse(action);
      const batchResult = resumeReplacementBatch(
        this.gameState,
        resumeCtx as unknown as ReplacementBatchResumeContext,
        accepted,
        this.cardDb,
      );
      this.gameState = batchResult.state;

      if (batchResult.pendingPrompt) {
        if (this.gameState.effectStack.length > stateBeforeResume.effectStack.length) {
          this.attachReplacementBatchContinuation(
            resumeCtx as unknown as ReplacementBatchResumeContext,
          );
        }
        this.gameState = { ...this.gameState, pendingPrompt: batchResult.pendingPrompt };
      } else {
        resumedGameOver = this.finishReplacementBatchResult(
          batchResult,
          resumeCtx as unknown as ReplacementBatchResumeContext,
        ) ?? resumedGameOver;
        if (!this.gameState.pendingPrompt && !resumedGameOver) {
          resumedGameOver = this.resumeInterruptedEffectContinuations(action) ?? resumedGameOver;
        }
      }
    } else if (this.gameState.effectStack.length > 0) {
      // Stack-based resume — use new effect stack system
      const resumedFrame = this.gameState.effectStack.at(-1) as unknown as EffectStackFrame;
      const resumeResult = resumeFromStack(this.gameState, action, this.cardDb);
      this.gameState = resumeResult.state;

      if (resumeResult.pendingPrompt) {
        if (resumedFrame.replacementBatchContinuation) {
          this.attachReplacementBatchContinuation(resumedFrame.replacementBatchContinuation);
        }
        this.gameState = { ...this.gameState, pendingPrompt: resumeResult.pendingPrompt };
        // OPT-446: a rejection that re-issues the prompt (OPT-439 restore
        // path) is still a rejection — surface it to the sender.
        if (resumeResult.rejected) {
          responseRejected = true;
        }
      } else if (!resumeResult.resolved && resumeResult.events.length === 0) {
        // OPT-436: the handler rejected the response (stale/duplicate/invalid)
        // without issuing a replacement prompt. Restore the complete state
        // from before resume, including the prompt and any frame the resume
        // router may have popped while validating the response.
        this.gameState = stateBeforeResume;
        responseRejected = true;
      } else {
        resumedGameOver = this.completeReplacementBatchContinuation(resumedFrame) ?? resumedGameOver;
        if (!this.gameState.pendingPrompt && !resumedGameOver) {
          resumedGameOver = this.resumeInterruptedEffectContinuations(action) ?? resumedGameOver;
        }
      }
    } else {
      // Legacy: bare ResumeContext (no stack frame) — fallback for backward compat
      const effectResumeCtx = resumeCtx as unknown as ResumeContext;
      const resumeResult = resumeEffectChain(this.gameState, effectResumeCtx, action, this.cardDb);
      this.gameState = resumeResult.state;

      if (resumeResult.pendingPrompt) {
        this.gameState = { ...this.gameState, pendingPrompt: resumeResult.pendingPrompt };
      } else if (!resumeResult.resolved && resumeResult.events.length === 0) {
        // OPT-436: same rejection-restore as the stack branch.
        this.gameState = stateBeforeResume;
        responseRejected = true;
      }
    }

    while (
      !this.gameState.pendingPrompt
      && this.gameState.effectStack.length === 0
      && this.gameState.turn.pendingBattleDamageContinuation
    ) {
      const continuation = resumeBattleDamageContinuation(this.gameState, this.cardDb);
      const pipelineResult = continuePipelineFromExecution(
        continuation.state,
        continuation,
        this.cardDb,
        respondingPlayer,
      );
      this.gameState = pipelineResult.state;
      resumedGameOver = pipelineResult.gameOver;
      if (resumedGameOver) break;
    }

    // Recalculate battle powers after effect resolution — trigger effects
    // (e.g., [On Your Opponent's Attack] → MODIFY_POWER) may have changed them
    if (this.cardDb) {
      this.gameState = recalculateBattlePowers(this.gameState, this.cardDb);
    }

    // Run start-of-turn auto phases in case this was end-of-turn
    if (!this.gameState.pendingPrompt) {
      this.gameState = this.runStartOfTurnAutoPhases(this.gameState);
    }

    // Surface REVEAL_TRIGGER as a durable prompt before persisting
    this.surfaceRevealTriggerIfNeeded();

    await this.persist();

    if (resumedGameOver) {
      this.undoHistory = [];
      await this.writeResultToDb();
      this.broadcastFilteredState((s) => ({ type: "game:update", action, state: s, canUndo: false }));
      this.broadcast({
        type: "game:over",
        winner: resumedGameOver.winner,
        reason: resumedGameOver.reason,
      });
      return;
    }
    this.broadcastFilteredState((s) => ({ type: "game:update", action, state: s }));

    // OPT-446: engine-level rejections previously answered with only a
    // game:update echoing the rejected action — the sender couldn't tell
    // rejection from acceptance without diffing state. Surface it explicitly,
    // matching the gate paths.
    if (responseRejected) {
      this.send(ws, {
        type: "game:error",
        message: "That prompt response was rejected; the pending prompt is unchanged",
      });
    }

    if (this.gameState.pendingPrompt) {
      this.sendEffectPrompt(this.gameState.pendingPrompt);
    } else {
      this.sendPendingPrompts();
    }
  }

  /**
   * Persist the interrupted action's result across a replacement prompt so
   * IF_DO and result_ref consumers see the same contract as an inline action.
   */
  private recordReplacementContinuationResult(
    succeeded: boolean,
    finalizedIds: string[],
  ): void {
    if (!this.gameState) return;
    let index = -1;
    for (let i = this.gameState.effectStack.length - 1; i >= 0; i--) {
      if (this.gameState.effectStack[i].phase === "INTERRUPTED_BY_TRIGGERS") {
        index = i;
        break;
      }
    }
    if (index < 0) return;

    const frame = this.gameState.effectStack[index] as unknown as EffectStackFrame;
    const resultRefs = [...frame.resultRefs];
    const resultRef = frame.pausedAction?.result_ref;
    if (resultRef) {
      const nextResult: [string, unknown] = [
        resultRef,
        { targetInstanceIds: finalizedIds, count: finalizedIds.length },
      ];
      const existing = resultRefs.findIndex(([key]) => key === resultRef);
      if (existing >= 0) resultRefs[existing] = nextResult;
      else resultRefs.push(nextResult);
    }

    const updatedFrame: EffectStackFrame = {
      ...frame,
      priorActionSucceeded: succeeded,
      resultRefs,
    };
    this.gameState = {
      ...this.gameState,
      effectStack: [
        ...this.gameState.effectStack.slice(0, index),
        updatedFrame,
        ...this.gameState.effectStack.slice(index + 1),
      ],
    };
  }

  private attachReplacementBatchContinuation(
    context: ReplacementBatchResumeContext,
  ): void {
    if (!this.gameState || this.gameState.effectStack.length === 0) return;
    const index = this.gameState.effectStack.length - 1;
    const frame = this.gameState.effectStack[index] as unknown as EffectStackFrame;
    this.gameState = {
      ...this.gameState,
      effectStack: [
        ...this.gameState.effectStack.slice(0, index),
        { ...frame, replacementBatchContinuation: context },
      ],
    };
  }

  private completeReplacementBatchContinuation(
    frame: EffectStackFrame,
  ): ResumedGameOver | undefined {
    if (!this.gameState || !this.cardDb || !frame.replacementBatchContinuation) return undefined;
    const batchResult = continueReplacementBatchAfterSubstitute(
      this.gameState,
      frame.replacementBatchContinuation,
      this.cardDb,
    );
    this.gameState = batchResult.state;
    if (batchResult.pendingPrompt) {
      this.gameState = { ...this.gameState, pendingPrompt: batchResult.pendingPrompt };
      return undefined;
    }
    return this.finishReplacementBatchResult(
      batchResult,
      frame.replacementBatchContinuation,
    );
  }

  private finishReplacementBatchResult(
    batchResult: BatchResumeResult,
    context: ReplacementBatchResumeContext,
  ): ResumedGameOver | undefined {
    if (!this.gameState || !this.cardDb) return undefined;
    this.recordReplacementContinuationResult(
      batchResult.finalizedIds.length > 0,
      batchResult.finalizedIds,
    );
    if (batchResult.events.length === 0) return undefined;

    const outerContinuation = (this.gameState.effectStack.at(-1) as unknown as EffectStackFrame | undefined)
      ?.replacementBatchContinuation;
    const pipelineResult = continuePipelineFromExecution(
      this.gameState,
      { state: this.gameState, events: batchResult.events },
      this.cardDb,
      context.causingController,
    );
    this.gameState = pipelineResult.state;
    if (pipelineResult.pendingPrompt && outerContinuation) {
      this.attachReplacementBatchContinuation(outerContinuation);
    }
    return pipelineResult.gameOver;
  }

  /** Drain a parked outer effect after any nested replacement prompt resolves. */
  private resumeInterruptedEffectContinuations(action: GameAction): ResumedGameOver | undefined {
    if (!this.gameState || !this.cardDb) return undefined;
    let gameOver: ResumedGameOver | undefined;
    while (
      !this.gameState.pendingPrompt
      && !gameOver
      && this.gameState.effectStack.at(-1)?.phase === "INTERRUPTED_BY_TRIGGERS"
    ) {
      const resumedFrame = this.gameState.effectStack.at(-1) as unknown as EffectStackFrame;
      const continuation = resumeFromStack(this.gameState, action, this.cardDb);
      this.gameState = continuation.state;
      if (continuation.pendingPrompt) {
        if (resumedFrame.replacementBatchContinuation) {
          this.attachReplacementBatchContinuation(resumedFrame.replacementBatchContinuation);
        }
        this.gameState = { ...this.gameState, pendingPrompt: continuation.pendingPrompt };
        break;
      }
      gameOver = this.completeReplacementBatchContinuation(resumedFrame) ?? gameOver;
      if (this.gameState.pendingPrompt) {
        break;
      }
    }
    return gameOver;
  }

  private sendEffectPrompt(prompt: PendingPromptState): void {
    const playerWs = this.getWebSocketForPlayer(prompt.respondingPlayer);
    if (playerWs) {
      this.send(playerWs, {
        type: "game:prompt",
        promptId: prompt.promptId,
        options: filterPromptOptionsForPlayer(prompt.options),
      });
    }
  }

  private sendPendingPrompts(): void {
    if (!this.gameState) return;

    // Effect prompt or active effect stack takes priority over battle prompts
    if (this.gameState.pendingPrompt) {
      this.sendEffectPrompt(this.gameState.pendingPrompt);
      return;
    }
    if (this.gameState.effectStack.length > 0) {
      // Stack still has frames — defer battle prompts until stack unwinds
      return;
    }

    const { battleSubPhase, battle } = this.gameState.turn;
    const inactiveIdx = this.gameState.turn.activePlayerIndex === 0 ? 1 : 0;

    if (battleSubPhase === "BLOCK_STEP") {
      const inactiveWs = this.getWebSocketForPlayer(inactiveIdx);
      if (inactiveWs) {
        const blockers = this.gameState.players[inactiveIdx].characters
          .filter((c): c is import("./types.js").CardInstance => c !== null && c.state === "ACTIVE")
          .map((c) => c.instanceId);
        this.send(inactiveWs, {
          type: "game:prompt",
          options: { promptType: "SELECT_BLOCKER" as const, validTargets: blockers, optional: true, timeoutMs: 30_000 },
        });
      }
    } else if (battleSubPhase === "DAMAGE_STEP" && battle && "pendingTriggerLifeCard" in battle) {
      const inactiveWs = this.getWebSocketForPlayer(inactiveIdx);
      if (inactiveWs) {
        const triggerLifeCard = (battle as BattleContext & { pendingTriggerLifeCard?: LifeCard }).pendingTriggerLifeCard;
        const triggerCardData = triggerLifeCard && this.cardDb
          ? this.cardDb.get(triggerLifeCard.cardId)
          : undefined;
        // Build a CardInstance-like object for the client to display
        const triggerCards = triggerLifeCard ? [{
          instanceId: triggerLifeCard.instanceId,
          cardId: triggerLifeCard.cardId,
          zone: "LIFE" as const,
          state: "ACTIVE" as const,
          attachedDon: [] as DonInstance[],
          turnPlayed: null,
          controller: inactiveIdx as 0 | 1,
          owner: inactiveIdx as 0 | 1,
        }] : [];
        const effectDescription = triggerCardData?.triggerText
          ?? triggerCardData?.effectText
          ?? "You may reveal this Trigger card to activate its effect";
        this.send(inactiveWs, {
          type: "game:prompt",
          options: {
            promptType: "REVEAL_TRIGGER" as const,
            cards: triggerCards,
            effectDescription,
            optional: false,
            timeoutMs: 30_000,
          },
        });
      }
    }
  }

  /**
   * If the effect stack is empty and no prompt is pending, check whether a
   * [Trigger] Life card reveal is awaiting a decision — either on the active
   * battle (battle damage, battle.pendingTriggerLifeCard) or on the turn
   * (effect damage, turn.pendingTriggerFromEffect / OPT-259 F6). Surfacing it
   * as a durable pendingPrompt on the game state makes it survive reconnections
   * and prevents a race between game:update (clears activePrompt) and
   * game:prompt (sets it again).
   */
  private surfaceRevealTriggerIfNeeded(): void {
    if (!this.gameState || !this.cardDb) return;
    if (this.gameState.pendingPrompt) return;
    if (this.gameState.effectStack.length > 0) return;

    const { battleSubPhase, battle, pendingTriggerFromEffect } = this.gameState.turn;

    let triggerLifeCard: LifeCard | undefined;
    let respondingIdx: 0 | 1 | undefined;

    if (battleSubPhase === "DAMAGE_STEP" && battle) {
      const candidate = (battle as BattleContext & { pendingTriggerLifeCard?: LifeCard }).pendingTriggerLifeCard;
      if (candidate) {
        triggerLifeCard = candidate;
        respondingIdx = (this.gameState.turn.activePlayerIndex === 0 ? 1 : 0) as 0 | 1;
      }
    } else if (pendingTriggerFromEffect) {
      // OPT-259: effect-sourced damage trigger window.
      triggerLifeCard = pendingTriggerFromEffect.lifeCard;
      respondingIdx = pendingTriggerFromEffect.damagedPlayerIndex;
    }

    if (!triggerLifeCard || respondingIdx === undefined) return;

    const triggerCardData = this.cardDb.get(triggerLifeCard.cardId);

    const cards = [{
      instanceId: triggerLifeCard.instanceId,
      cardId: triggerLifeCard.cardId,
      zone: "LIFE" as const,
      state: "ACTIVE" as const,
      attachedDon: [] as DonInstance[],
      turnPlayed: null,
      controller: respondingIdx,
      owner: respondingIdx,
    }];

    const effectDescription = triggerCardData?.triggerText
      ?? triggerCardData?.effectText
      ?? "You may reveal this Trigger card to activate its effect";

    this.gameState = {
      ...this.gameState,
      pendingPrompt: {
        options: { promptType: "REVEAL_TRIGGER" as const, cards, effectDescription, optional: false, timeoutMs: 30_000 },
        respondingPlayer: respondingIdx,
        resumeContext: null,
      },
    };
  }

  // ─── Token validation ──────────────────────────────────────────────────────

  private async validateToken(token: string): Promise<0 | 1 | null> {
    const payload = await verifyGameToken(token, this.env.GAME_WORKER_SECRET, this.gameState?.id);
    if (!payload) {
      log("auth.failure", { reason: "invalid_token", gameId: this.gameState?.id });
      return null;
    }
    if (!this.gameState) {
      log("auth.failure", { reason: "no_game_state" });
      return null;
    }

    const players = this.gameState!.players;
    const userId = payload.sub;
    const matchesPlayer1 = players[0].playerId === userId;
    const matchesPlayer2 = players[1].playerId === userId;
    let playerIndex: 0 | 1 | null = null;

    if (matchesPlayer1 && matchesPlayer2) {
      if (payload.playerIndex !== undefined) {
        if (this.gameMode !== "SOLITAIRE") {
          log("auth.failure", {
            reason: "player_index_forbidden",
            gameId: this.gameState.id,
            mode: this.gameMode,
            userId,
          });
          return null;
        }
        playerIndex = payload.playerIndex;
      } else {
        playerIndex = 0;
      }
    } else if (matchesPlayer1) {
      playerIndex = 0;
    } else if (matchesPlayer2) {
      playerIndex = 1;
    }

    if (playerIndex === null) {
      log("auth.failure", { reason: "user_not_in_game", gameId: this.gameState.id, userId });
      return null;
    }

    const consumed = await consumeTokenJti(
      this.state.storage,
      payload.jti,
      payload.exp,
    );
    if (!consumed) {
      log("auth.failure", { reason: "token_replay", gameId: this.gameState.id, userId });
      return null;
    }

    return playerIndex;
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    if (!this.gameState || !this.cardDb) return;
    if (this.gameState.pendingPrompt && !this.gameState.pendingPrompt.promptId) {
      this.gameState = {
        ...this.gameState,
        pendingPrompt: {
          ...this.gameState.pendingPrompt,
          promptId: crypto.randomUUID(),
        },
      };
    }
    const stored: StoredSession = {
      state: this.gameState,
      cardDb: Object.fromEntries(this.cardDb),
      mode: this.gameMode,
      testPriorityRolls: this.testPriorityRolls,
      undoHistory: this.undoHistory,
    };
    await this.state.storage.put("session", stored);
  }

  private async loadFromStorage(): Promise<boolean> {
    const stored = await this.state.storage.get<StoredSession>("session");
    if (!stored) return false;

    this.gameState = stored.state;
    this.cardDb = new Map(Object.entries(stored.cardDb));
    this.gameMode = stored.mode ?? "PVP";
    this.testPriorityRolls = stored.testPriorityRolls ?? null;
    this.undoHistory = stored.undoHistory ?? [];
    return true;
  }

  private async writeResultToDb(): Promise<void> {
    if (!this.gameState) return;
    // POST the result back to the Next.js API so it can update game_sessions in PostgreSQL.
    const body = buildGameResultCallbackPayload(this.gameState);

    const url = `${this.env.NEXTJS_URL}/api/game/result`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.env.GAME_WORKER_SECRET}`,
      },
      body: JSON.stringify(body),
    }).catch((err: unknown) => {
      console.error("[GameSession] writeResultToDb fetch failed:", url, err);
      return null;
    });
    if (!res) return;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[GameSession] writeResultToDb HTTP", res.status, text.slice(0, 300));
    }
  }

  // ─── Broadcast helpers ─────────────────────────────────────────────────────

  private broadcast(msg: ServerMessage): void {
    const sockets = this.state.getWebSockets();
    const payload = JSON.stringify(msg);
    for (const ws of sockets) {
      if (!this.shouldSendToSocket(ws)) continue;
      try { ws.send(payload); } catch { /* closed */ }
    }
  }

  /**
   * Send a state-bearing message to each player with their secret zones filtered.
   * Each player receives their own zones in full; the opponent's hand, deck, and
   * face-down life cards are obfuscated (§8-4-5).
   */
  private broadcastFilteredState(
    build: (filteredState: GameState) => ServerMessage,
    exclude?: WebSocket,
  ): void {
    // Pre-filter activeEffects to remove effects whose WHILE_CONDITION is not met
    // (e.g., IS_MY_TURN). The client doesn't evaluate conditions — it applies
    // all effects in activeEffects unconditionally for display purposes.
    const baseState = this.stripInactiveEffects(this.gameState!);
    for (const playerIndex of [0, 1] as const) {
      const ws = this.getWebSocketForPlayer(playerIndex);
      if (!ws || ws === exclude) continue;
      const filtered = filterStateForPlayer(baseState, playerIndex);
      this.send(ws, build(filtered));
    }
  }

  /**
   * Remove effects from activeEffects whose WHILE_CONDITION duration is currently
   * not satisfied. This ensures the client only sees effects that are actually active.
   */
  private stripInactiveEffects(state: GameState): GameState {
    if (!this.cardDb) return state;
    const effects = state.activeEffects as RuntimeActiveEffect[];
    const active = effects.filter((e) => isEffectConditionMet(e, state, this.cardDb!));
    if (active.length === state.activeEffects.length) return state;
    return { ...state, activeEffects: active };
  }

  private broadcastExcept(exclude: WebSocket, msg: ServerMessage): void {
    const sockets = this.state.getWebSockets();
    const payload = JSON.stringify(msg);
    for (const ws of sockets) {
      if (ws !== exclude) {
        if (!this.shouldSendToSocket(ws)) continue;
        try { ws.send(payload); } catch { /* closed */ }
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }

  private getWebSocketForPlayer(playerIndex: 0 | 1): WebSocket | null {
    const sockets = this.state.getWebSockets(`player-${playerIndex}`);
    let newest: { ws: WebSocket; attachment: PlayerSocketAttachment } | null = null;
    for (const ws of sockets) {
      const attachment = getPlayerSocketAttachment(ws);
      if (!attachment || attachment.playerIndex !== playerIndex) continue;
      if (
        !newest
        || attachment.acceptedAt > newest.attachment.acceptedAt
        || (
          attachment.acceptedAt === newest.attachment.acceptedAt
          && attachment.connectionId > newest.attachment.connectionId
        )
      ) {
        newest = { ws, attachment };
      }
    }
    if (newest) return newest.ws;

    return sockets[0] ?? null;
  }

  private closeStaleSocketsForPlayer(playerIndex: 0 | 1, authoritativeWs: WebSocket): void {
    const sockets = this.state.getWebSockets(`player-${playerIndex}`);
    for (const ws of sockets) {
      if (ws === authoritativeWs) continue;
      try { ws.close(SUPERSEDED_SOCKET_CLOSE_CODE, SUPERSEDED_SOCKET_CLOSE_REASON); } catch { /* ignore */ }
    }
  }

  private acceptAuthoritativePlayerSocket(playerIndex: 0 | 1, ws: WebSocket): void {
    // A pending DISCONNECTED broadcast from a recent close on this slot is
    // now obsolete: the player is back. Drop the timer before accepting so
    // the broadcast never goes out.
    this.cancelPendingDisconnect(playerIndex);
    this.state.acceptWebSocket(ws, [`player-${playerIndex}`]);
    const acceptedAt = Date.now();
    ws.serializeAttachment({
      type: "game-session-player-socket",
      playerIndex,
      connectionId: `${acceptedAt}-${this.nextWebSocketSequence++}`,
      acceptedAt,
    } satisfies PlayerSocketAttachment);
    this.closeStaleSocketsForPlayer(playerIndex, ws);
  }

  private isAuthoritativePlayerSocket(ws: WebSocket, playerIndex: 0 | 1): boolean {
    return this.getWebSocketForPlayer(playerIndex) === ws;
  }

  private shouldSendToSocket(ws: WebSocket): boolean {
    const tags = this.state.getTags(ws);
    const playerTag = tags.find((t) => t.startsWith("player-"));
    if (!playerTag) return true;

    const parsed = parseInt(playerTag.replace("player-", ""));
    if (parsed !== 0 && parsed !== 1) return false;
    return this.isAuthoritativePlayerSocket(ws, parsed as 0 | 1);
  }

  private setPlayerPresence(
    state: GameState,
    playerIndex: 0 | 1,
    updates: {
      connected: boolean;
      awayReason: "LEFT" | "DISCONNECTED" | null;
      rejoinDeadlineAt: number | null;
    },
  ): GameState {
    const nextState = setPlayerConnected(state, playerIndex, updates.connected);
    const newPlayers: [GameState["players"][0], GameState["players"][1]] = [...nextState.players] as typeof nextState.players;
    newPlayers[playerIndex] = {
      ...newPlayers[playerIndex],
      awayReason: updates.awayReason,
      rejoinDeadlineAt: updates.rejoinDeadlineAt,
    };
    return { ...nextState, players: newPlayers };
  }

  private async handlePlayerAway(
    playerIndex: 0 | 1,
    reason: "LEFT" | "DISCONNECTED",
    excludeWs?: WebSocket,
  ): Promise<void> {
    if (!this.gameState) return;

    this.gameState = this.setPlayerPresence(this.gameState, playerIndex, {
      connected: false,
      awayReason: reason,
      rejoinDeadlineAt: Date.now() + REJOIN_WINDOW_MS,
    });
    await this.persist();
    await this.syncAlarm();

    if (excludeWs) {
      this.broadcastFilteredState((s) => ({ type: "game:state", state: s }), excludeWs);
      this.broadcastExcept(excludeWs, { type: "game:player_disconnected", playerIndex });
      return;
    }

    this.broadcastFilteredState((s) => ({ type: "game:state", state: s }));
    this.broadcast({ type: "game:player_disconnected", playerIndex });
  }

  private async handlePregameLeave(playerIndex: 0 | 1): Promise<void> {
    if (!this.gameState) return;
    const winner: 0 | 1 = playerIndex === 0 ? 1 : 0;
    const reason = `Player ${playerIndex + 1} left during pre-game`;
    this.gameState = {
      ...this.gameState,
      status: "FINISHED",
      winner,
      winReason: reason,
      pendingPrompt: null,
      pregame: null,
    };
    this.undoHistory = [];
    await this.persist();
    await this.writeResultToDb();
    this.broadcastFilteredState((s) => ({ type: "game:state", state: s, canUndo: false }));
    this.broadcast({ type: "game:over", winner, reason });
  }

  private async syncAlarm(): Promise<void> {
    if (!this.gameState) return;

    const nextDeadline = this.gameState.players.reduce<number | null>((current, player) => {
      if (player.connected || player.rejoinDeadlineAt === null) return current;
      if (current === null) return player.rejoinDeadlineAt;
      return Math.min(current, player.rejoinDeadlineAt);
    }, null);

    if (nextDeadline === null) {
      await this.state.storage.deleteAlarm();
      return;
    }

    await this.state.storage.setAlarm(nextDeadline);
  }

  // ─── Undo eligibility ───────────────────────────────────────────────────

  private canUndo(playerIndex: 0 | 1): boolean {
    if (!this.gameState) return false;
    if (this.undoHistory.length === 0) return false;
    if (this.gameState.status !== "IN_PROGRESS") return false;
    if (playerIndex !== this.gameState.turn.activePlayerIndex) return false;
    if (this.gameState.pendingPrompt) return false;
    if (this.gameState.effectStack.length > 0) return false;
    if (this.gameState.turn.battleSubPhase) return false;
    return true;
  }

  private getPauseReason(playerIndex: 0 | 1): string | null {
    if (!this.gameState) return null;

    const awayPlayers = ([0, 1] as const).filter((index) => {
      const player = this.gameState!.players[index];
      return !player.connected && player.rejoinDeadlineAt !== null;
    });

    if (awayPlayers.length === 0) return null;
    if (awayPlayers.length === 2) return "Both players are away. Rejoin to continue.";

    const awayPlayer = awayPlayers[0];
    if (awayPlayer === playerIndex) {
      return "You left the game. Rejoin to continue.";
    }
    if (this.gameState.turn.activePlayerIndex === awayPlayer) {
      return `Waiting for Player ${awayPlayer + 1} to rejoin for their turn.`;
    }

    const battleSubPhase = this.gameState.turn.battleSubPhase;
    if (battleSubPhase === "BLOCK_STEP" || battleSubPhase === "COUNTER_STEP" || battleSubPhase === "DAMAGE_STEP") {
      return `Waiting for Player ${awayPlayer + 1} to rejoin before battle can continue.`;
    }

    return null;
  }
}
