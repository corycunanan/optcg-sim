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
  Env,
  GameAction,
  GameInitPayload,
  GameState,
  LobbyMode,
  PregameMode,
  ServerMessage,
  PendingPromptState,
} from "./types.js";
import { prepareDecksAndLeaders } from "./engine/setup.js";
import { advancePregame, startPregame } from "./engine/pregame.js";
import { createProductionExecutionContext } from "./engine/execution-context.js";
import {
  readDiscriminant,
  validateGameInitPayload,
  validateClientMessage,
  validateNotifyEndPayload,
} from "./util/validate.js";
import { configureLogger, log } from "./lib/log.js";
import { SessionAuthorizer, type SessionParticipantIdentity } from "./session/authorization.js";
import { SessionCoordinator } from "./session/coordinator.js";
import {
  DurableObjectSessionStorage,
  SessionRepository,
} from "./session/persistence.js";
import { createResultCallbackFetch } from "./session/result-callback.js";
import { consumePlayerUpgradeBudget } from "./session/player-rate-limit-policy.js";
import { resumePromptLifecycle } from "./session/prompt-lifecycle.js";
import { handleGameStatusRequest } from "./session/status.js";
import {
  computeEffectAvailability,
  effectAvailabilityForRecipient,
} from "./engine/availability.js";
import {
  ACTION_RATE_LIMIT_CLOSE_REASON,
  INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON,
  MAX_CLIENT_MESSAGE_BYTES,
  RATE_LIMIT_CLOSE_CODE,
  SessionRateLimiter,
  UPGRADE_RATE_LIMIT_RESPONSE_BODY,
  getClientMessageByteLength,
} from "./session/rate-limiter.js";
import { SpectatorPolicy } from "./session/spectator-policy.js";
import {
  SUPERSEDED_SOCKET_CLOSE_CODE,
  SUPERSEDED_SOCKET_CLOSE_REASON,
  SessionTransport,
} from "./session/transport.js";

export {
  ACTION_RATE_LIMIT_BURST,
  ACTION_RATE_LIMIT_CLOSE_REASON,
  ACTION_RATE_LIMIT_REFILL_PER_SECOND,
  INVALID_MESSAGE_RATE_LIMIT_BURST,
  INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON,
  INVALID_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND,
  MAX_CLIENT_MESSAGE_BYTES,
  RATE_LIMIT_CLOSE_CODE,
  SPECTATOR_MESSAGE_RATE_LIMIT_BURST,
  SPECTATOR_MESSAGE_RATE_LIMIT_REFILL_PER_SECOND,
  UPGRADE_RATE_LIMIT_BURST,
  UPGRADE_RATE_LIMIT_REFILL_PER_SECOND,
  UPGRADE_RATE_LIMIT_RESPONSE_BODY,
  consumeTokenBucket,
  getClientMessageByteLength,
  getTokenBucketRetryAfterSeconds,
} from "./session/rate-limiter.js";
export { DISCONNECT_BROADCAST_DEBOUNCE_MS } from "./session/transport.js";
export {
  SPECTATOR_INVALID_SOCKET_CLOSE_REASON,
  SPECTATOR_MESSAGE_RATE_LIMIT_CLOSE_REASON,
  SPECTATOR_UPGRADE_RATE_LIMIT_RESPONSE_BODY,
} from "./session/spectator-policy.js";

const REJOIN_WINDOW_MS = 5 * 60 * 1000;
export class GameSession implements DurableObject {
  private gameState: GameState | null = null;
  private gameMode: LobbyMode = "PVP";
  private pregameMode: PregameMode = "PRIORITY_ROLL";
  private cardDb: Map<string, CardData> | null = null;
  private undoHistory: GameState[] = [];
  /** OPT-366: deterministic priority-roll sequence (test-only). */
  private testPriorityRolls: number[] | null = null;
  private readonly authorizer: SessionAuthorizer;
  private readonly coordinator = new SessionCoordinator();
  private readonly repository: SessionRepository;
  private readonly rateLimiter = new SessionRateLimiter();
  private readonly spectatorPolicy: SpectatorPolicy;
  private readonly transport: SessionTransport;

  constructor(public state: DurableObjectState, public env: Env) {
    const storage = new DurableObjectSessionStorage(state.storage);
    this.authorizer = new SessionAuthorizer(storage, env.GAME_WORKER_SECRET);
    this.repository = new SessionRepository(
      storage,
      {
        nextJsUrl: env.NEXTJS_URL,
        workerSecret: env.GAME_WORKER_SECRET,
      },
      createResultCallbackFetch()
    );
    this.transport = new SessionTransport(state, (playerIndex) =>
      this.handlePlayerAway(playerIndex, "DISCONNECTED")
    );
    this.spectatorPolicy = new SpectatorPolicy(
      this.transport,
      this.rateLimiter,
      () => this.gameState?.id
    );
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
    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return handleGameStatusRequest(
        request,
        this.env.GAME_WORKER_SECRET,
        async () => {
          if (!this.gameState) await this.loadFromStorage();
          return this.gameState;
        }
      );
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
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : "Invalid payload",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { state: prepared, cardDb } = prepareDecksAndLeaders(
      payload,
      createProductionExecutionContext(payload.gameId)
    );

    this.cardDb = cardDb;
    this.gameMode = payload.mode;
    this.pregameMode = payload.pregameMode;
    this.testPriorityRolls = payload.testPriorityRolls ?? null;

    // Enter the configured pregame state machine — optional priority decision,
    // start-of-game effects, hand deal, mulligan decisions, life placement —
    // before the first player's REFRESH.
    const initial = startPregame(prepared, this.pregameMode);
    this.gameState = this.drainPregame(initial);

    // Persist to DO storage so state survives hibernation
    await this.persist();
    await this.repository.initializeTokenLedger();

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
    const result = advancePregame(state, this.cardDb, this.testPriorityRolls);
    if (!result.done) return result.state;
    // FSM drained — run normal start-of-turn auto-phases for the first player.
    return this.runStartOfTurnAutoPhases(result.state);
  }

  /** Called from Next.js after a game is finished in Postgres (e.g. disconnected concede). */
  private async handleNotifyEnd(request: Request): Promise<Response> {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${this.env.GAME_WORKER_SECRET}`) {
      log("auth.failure", {
        reason: "notify_end_bad_secret",
        gameId: this.gameState?.id,
      });
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
      if (!loaded)
        return new Response("Game not initialized", {
          status: 404,
          headers: corsHeaders,
        });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token)
      return new Response("Missing token", {
        status: 401,
        headers: corsHeaders,
      });
    const identity = await this.validateToken(token);
    if (identity === null)
      return new Response("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      });

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
    const identity = await this.validateToken(token);
    if (identity === null) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (identity.role === "spectator")
      return this.spectatorPolicy.handleUpgrade(identity.userId);
    const { playerIndex } = identity;

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
    this.acceptAuthoritativePlayerSocket(playerIndex, server);

    // Mark player as connected
    this.gameState = this.coordinator.setPlayerPresence(
      this.gameState!,
      playerIndex,
      {
        connected: true,
        awayReason: null,
        rejoinDeadlineAt: null,
      }
    );
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
      this.gameState!.status === "IN_PROGRESS" &&
      this.gameState!.pendingPrompt?.respondingPlayer === playerIndex
    ) {
      this.sendEffectPrompt(this.gameState!.pendingPrompt);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── WebSocket message handler (Hibernation API) ───────────────────────────

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const playerIndex = this.spectatorPolicy.playerIndexForInbound(ws);
    if (playerIndex === null) return;
    await this.coordinator.run(() =>
      this.handleWebSocketMessage(ws, message, playerIndex)
    );
  }

  private async handleWebSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
    playerIndex: 0 | 1
  ): Promise<void> {
    if (getClientMessageByteLength(message) > MAX_CLIENT_MESSAGE_BYTES) {
      log("ws.message_too_large", { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
      try {
        ws.close(1009, "message too big");
      } catch {
        /* ignore */
      }
      return;
    }

    if (!this.gameState || !this.cardDb) {
      await this.loadFromStorage();
    }

    if (!this.isAuthoritativePlayerSocket(ws, playerIndex)) {
      try {
        ws.close(SUPERSEDED_SOCKET_CLOSE_CODE, SUPERSEDED_SOCKET_CLOSE_REASON);
      } catch {
        /* ignore */
      }
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message)
      );
    } catch {
      if (!this.consumeInvalidMessageBudget(playerIndex)) return;
      this.send(ws, { type: "game:error", message: "Invalid message format" });
      return;
    }

    const rawType = readDiscriminant(raw, "type");

    // Leave stays available; action-shaped messages spend gameplay budget before Zod validation.
    // Unknown or malformed envelopes spend a smaller abuse budget.
    if (rawType === "game:action" && !this.consumeActionBudget(playerIndex))
      return;
    if (
      rawType !== "game:action" &&
      rawType !== "game:leave" &&
      !this.consumeInvalidMessageBudget(playerIndex)
    )
      return;

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
        try {
          ws.close(1000, "left");
        } catch {
          /* ignore */
        }
        return;
      }
      await this.handlePlayerAway(playerIndex, "LEFT", ws);
      try {
        ws.close(1000, "left");
      } catch {
        /* ignore */
      }
      return;
    }

    if (clientMsg.type === "game:action") {
      await this.handleAction(ws, playerIndex, clientMsg.action);
    }
  }

  private consumeActionBudget(playerIndex: 0 | 1): boolean {
    const result = this.rateLimiter.consumeAction(
      this.gameState?.id,
      playerIndex
    );
    if (result.allowed) return true;

    log("ws.action_rate_limited", { gameId: this.gameState?.id, playerIndex });
    const ws = this.getWebSocketForPlayer(playerIndex);
    if (ws) {
      this.send(ws, {
        type: "game:error",
        message: ACTION_RATE_LIMIT_CLOSE_REASON,
      });
      try {
        ws.close(RATE_LIMIT_CLOSE_CODE, ACTION_RATE_LIMIT_CLOSE_REASON);
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  private consumeInvalidMessageBudget(playerIndex: 0 | 1): boolean {
    const result = this.rateLimiter.consumeInvalidMessage(
      this.gameState?.id,
      playerIndex
    );
    if (result.allowed) return true;

    log("ws.invalid_message_rate_limited", {
      gameId: this.gameState?.id,
      playerIndex,
    });
    const ws = this.getWebSocketForPlayer(playerIndex);
    if (ws) {
      this.send(ws, {
        type: "game:error",
        message: INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON,
      });
      try {
        ws.close(
          RATE_LIMIT_CLOSE_CODE,
          INVALID_MESSAGE_RATE_LIMIT_CLOSE_REASON
        );
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  private consumeUpgradeBudget(playerIndex: 0 | 1): {
    allowed: boolean;
    retryAfterSeconds: number;
  } {
    return consumePlayerUpgradeBudget(
      this.rateLimiter,
      this.gameState?.id,
      playerIndex
    );
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string
  ): Promise<void> {
    void code;
    void reason;

    if (!this.gameState) {
      await this.loadFromStorage();
    }

    const playerIndex = this.transport.playerIndexFor(ws);
    if (playerIndex === null || !this.gameState) return;
    if (!this.isAuthoritativePlayerSocket(ws, playerIndex)) return;
    if (!this.gameState.players[playerIndex].connected) return;
    this.scheduleDisconnectBroadcast(playerIndex);
  }

  private scheduleDisconnectBroadcast(playerIndex: 0 | 1): void {
    this.transport.scheduleDisconnect(playerIndex);
  }

  private cancelPendingDisconnect(playerIndex: 0 | 1): void {
    this.transport.cancelDisconnect(playerIndex);
  }

  async alarm(): Promise<void> {
    if (!this.gameState) await this.loadFromStorage();
    if (!this.gameState || this.gameState.status !== "IN_PROGRESS") return;

    const now = Date.now();
    const expiredPlayers = ([0, 1] as const).filter((playerIndex) => {
      const player = this.gameState!.players[playerIndex];
      return (
        !player.connected &&
        player.rejoinDeadlineAt !== null &&
        player.rejoinDeadlineAt <= now
      );
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
    action: GameAction
  ): Promise<void> {
    if (!this.gameState || !this.cardDb) return;
    const previousState = this.gameState;
    const previousUndoHistory = this.undoHistory;
    const result = this.coordinator.executeAction(
      this.gameState,
      this.undoHistory,
      playerIndex,
      action,
      this.cardDb
    );
    this.gameState = result.state;
    this.undoHistory = result.undoHistory;

    if (result.kind === "reject") {
      this.rejectAction(ws, action, result.reason);
      return;
    }
    if (result.kind === "resume") {
      await this.resumeFromPrompt(ws, playerIndex, action);
      return;
    }
    try {
      await this.persist();
    } catch (error) {
      this.gameState = previousState;
      this.undoHistory = previousUndoHistory;
      log("session.persist_failed", {
        gameId: previousState.id,
        actionType: action.type,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      this.rejectAction(
        ws,
        action,
        "The action could not be saved; game state was not changed"
      );
      return;
    }

    if (result.kind === "undo") {
      this.broadcastFilteredState((state) => ({
        type: "game:state",
        state,
        canUndo: result.canUndo,
      }));
      this.broadcast({
        type: "game:undo",
        playerIndex,
        canUndo: result.canUndo,
      });
      return;
    }

    // Persist result to Postgres before any broadcast that lets clients leave for /lobbies;
    // otherwise GET /api/game/active can still see IN_PROGRESS and block new games.
    if (result.gameOver) {
      this.undoHistory = [];
      await this.writeResultToDb();
      this.broadcastGameUpdate(action, playerIndex, false);
      this.broadcast({
        type: "game:over",
        winner: result.gameOver.winner,
        reason: result.gameOver.reason,
      });
      return;
    }

    this.broadcastGameUpdate(action, playerIndex, result.canUndo);

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
    return this.coordinator.advanceStartOfTurn(state, this.cardDb);
  }

  private async resumeFromPrompt(
    ws: WebSocket,
    playerIndex: 0 | 1,
    action: GameAction
  ): Promise<void> {
    if (!this.gameState || !this.cardDb) return;
    const previousState = this.gameState;
    const previousUndoHistory = this.undoHistory;
    this.undoHistory = [];
    const result = resumePromptLifecycle(this.gameState, action, this.cardDb, {
      drainPregame: (state) => this.drainPregame(state),
      advanceStartOfTurn: (state) => this.runStartOfTurnAutoPhases(state),
    });
    this.gameState = result.state;

    // Surface REVEAL_TRIGGER as a durable prompt before persisting
    this.surfaceRevealTriggerIfNeeded();

    try {
      await this.persist();
    } catch (error) {
      this.gameState = previousState;
      this.undoHistory = previousUndoHistory;
      log("session.persist_failed", {
        gameId: previousState.id,
        actionType: action.type,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      this.rejectAction(
        ws,
        action,
        "The response could not be saved; the prompt is still pending"
      );
      return;
    }

    if (result.gameOver) {
      this.undoHistory = [];
      await this.writeResultToDb();
      this.broadcastGameUpdate(action, playerIndex, false);
      this.broadcast({
        type: "game:over",
        winner: result.gameOver.winner,
        reason: result.gameOver.reason,
      });
      return;
    }
    this.broadcastGameUpdate(action, playerIndex);

    // OPT-446: engine-level rejections previously answered with only a
    // game:update echoing the rejected action — the sender couldn't tell
    // rejection from acceptance without diffing state. Surface it explicitly,
    // matching the gate paths.
    if (result.responseRejected) {
      this.rejectAction(
        ws,
        action,
        "That prompt response was rejected; the pending prompt is unchanged"
      );
    }

    if (this.gameState.pendingPrompt) {
      this.sendEffectPrompt(this.gameState.pendingPrompt);
    } else {
      this.sendPendingPrompts();
    }
  }

  private rejectAction(
    ws: WebSocket,
    action: GameAction,
    reason: string
  ): void {
    this.send(ws, { type: "action:rejected", action, reason });
  }

  private sendEffectPrompt(prompt: PendingPromptState): void {
    this.transport.sendEffectPrompt(prompt);
  }

  private sendPendingPrompts(): void {
    if (!this.gameState || !this.cardDb) return;
    this.transport.sendPendingPrompts(this.gameState, this.cardDb);
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
    this.gameState = this.coordinator.surfaceRevealTrigger(
      this.gameState,
      this.cardDb
    );
  }

  // ─── Token validation ──────────────────────────────────────────────────────

  private async validateToken(token: string): Promise<SessionParticipantIdentity | null> {
    return this.authorizer.validate(token, {
      state: this.gameState,
      mode: this.gameMode,
    });
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    if (!this.gameState || !this.cardDb) return;
    const saved = await this.repository.save({
      state: this.gameState,
      cardDb: this.cardDb,
      mode: this.gameMode,
      pregameMode: this.pregameMode,
      testPriorityRolls: this.testPriorityRolls,
      undoHistory: this.undoHistory,
    });
    this.gameState = saved.state;
  }

  private async loadFromStorage(): Promise<boolean> {
    const snapshot = await this.repository.load();
    if (!snapshot) return false;
    this.gameState = snapshot.state;
    this.cardDb = snapshot.cardDb;
    this.gameMode = snapshot.mode;
    this.pregameMode = snapshot.pregameMode;
    this.testPriorityRolls = snapshot.testPriorityRolls;
    this.undoHistory = snapshot.undoHistory;
    return true;
  }

  private async writeResultToDb(): Promise<void> {
    if (!this.gameState) return;
    await this.repository.writeResult(this.gameState);
  }

  // ─── Broadcast helpers ─────────────────────────────────────────────────────

  private broadcast(msg: ServerMessage): void {
    this.transport.broadcast(msg);
  }

  /**
   * Send a state-bearing message to each player with their secret zones filtered.
   * Each player receives their own zones in full; the opponent's hand, deck, and
   * face-down life cards are obfuscated (§8-4-5).
   */
  private broadcastFilteredState(
    build: (
      filteredState: GameState,
      recipientPlayerIndex: 0 | 1
    ) => ServerMessage,
    exclude?: WebSocket
  ): void {
    if (!this.gameState || !this.cardDb) return;
    const state = this.gameState;
    const cardDb = this.cardDb;
    const availability = computeEffectAvailability(state, cardDb);
    this.transport.broadcastFilteredState(
      state,
      cardDb,
      (filteredState, recipientPlayerIndex) =>
        build(
          {
            ...filteredState, // OPT-550: spectators merge both controllers because availability derives only from already-visible zones and adds no information.
            effectAvailability: effectAvailabilityForRecipient(
              state, // OPT-552: catch null-recipient failures per recipient; a spectator-first/between throw otherwise skips later player delivery.
              availability,
              recipientPlayerIndex
            ),
          },
          recipientPlayerIndex
        ),
      exclude
    );
  }

  /**
   * A game update's state is filtered for every recipient. Its action echo is
   * private to the acting player: prompt responses can contain opaque IDs and
   * ordering from hidden zones that the visible state intentionally omits.
   */
  private broadcastGameUpdate(
    action: GameAction,
    actingPlayerIndex: 0 | 1,
    canUndo?: boolean
  ): void {
    this.broadcastFilteredState((state, recipientPlayerIndex) => ({
      type: "game:update",
      ...(recipientPlayerIndex === actingPlayerIndex ? { action } : {}),
      state,
      ...(canUndo === undefined ? {} : { canUndo }),
    }));
  }

  private broadcastExcept(exclude: WebSocket, msg: ServerMessage): void {
    this.transport.broadcastExcept(exclude, msg);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    this.transport.send(ws, msg);
  }

  private getWebSocketForPlayer(playerIndex: 0 | 1): WebSocket | null {
    return this.transport.playerSocket(playerIndex);
  }

  private acceptAuthoritativePlayerSocket(
    playerIndex: 0 | 1,
    ws: WebSocket
  ): void {
    this.transport.accept(playerIndex, ws);
  }

  private isAuthoritativePlayerSocket(
    ws: WebSocket,
    playerIndex: 0 | 1
  ): boolean {
    return this.transport.isAuthoritative(ws, playerIndex);
  }

  private async handlePlayerAway(
    playerIndex: 0 | 1,
    reason: "LEFT" | "DISCONNECTED",
    excludeWs?: WebSocket
  ): Promise<void> {
    if (!this.gameState) return;

    this.gameState = this.coordinator.setPlayerPresence(
      this.gameState,
      playerIndex,
      {
        connected: false,
        awayReason: reason,
        rejoinDeadlineAt: Date.now() + REJOIN_WINDOW_MS,
      }
    );
    await this.persist();
    await this.syncAlarm();

    if (excludeWs) {
      this.broadcastFilteredState(
        (s) => ({ type: "game:state", state: s }),
        excludeWs
      );
      this.broadcastExcept(excludeWs, {
        type: "game:player_disconnected",
        playerIndex,
      });
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
    this.broadcastFilteredState((s) => ({
      type: "game:state",
      state: s,
      canUndo: false,
    }));
    this.broadcast({ type: "game:over", winner, reason });
  }

  private async syncAlarm(): Promise<void> {
    if (!this.gameState) return;
    await this.repository.syncAlarm(this.gameState);
  }
}
