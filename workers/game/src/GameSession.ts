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
  ServerMessage,
  PendingPromptState,
  ResumeContext,
} from "./types.js";
import { buildInitialState } from "./engine/setup.js";
import { runPipeline } from "./engine/pipeline.js";
import { resumeReplacement, type ReplacementResumeContext } from "./engine/replacements.js";
import { filterStateForPlayer, setPlayerConnected } from "./engine/state.js";
import { verifyGameToken } from "./util/auth.js";
import { isStartOfTurnAutoPhase } from "./engine/phases.js";
import { resumeEffectChain, resumeFromStack } from "./engine/effect-resolver/index.js";
import { recalculateBattlePowers } from "./engine/battle.js";

const REJOIN_WINDOW_MS = 5 * 60 * 1000;

// Stored in DO persistent storage
interface StoredSession {
  state: GameState;
  cardDb: Record<string, CardData>; // serialized as plain object
  mulliganDone: [boolean, boolean];
  undoHistory?: GameState[]; // snapshot stack for undo (v1: max depth 1)
}

export class GameSession implements DurableObject {
  state: DurableObjectState;
  env: Env;

  // In-memory cache (rebuilt from storage on wake)
  private gameState: GameState | null = null;
  private cardDb: Map<string, CardData> | null = null;
  private mulliganDone: [boolean, boolean] = [false, false];
  private undoHistory: GameState[] = [];

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
    const payload = await request.json() as GameInitPayload;
    const { state, cardDb } = buildInitialState(payload);

    this.cardDb = cardDb;
    this.mulliganDone = [false, false];

    // Setup returns phase=REFRESH; auto-advance through the start-of-turn phases
    // (REFRESH → DRAW → DON → MAIN) so the first player is immediately at MAIN.
    this.gameState = this.runStartOfTurnAutoPhases(state);

    // Persist to DO storage so state survives hibernation
    await this.persist();

    return new Response(JSON.stringify({ ok: true, gameId: state.id }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /** Called from Next.js after a game is finished in Postgres (e.g. disconnected concede). */
  private async handleNotifyEnd(request: Request): Promise<Response> {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${this.env.GAME_WORKER_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: { winnerIndex?: unknown; reason?: unknown };
    try {
      body = await request.json() as { winnerIndex?: unknown; reason?: unknown };
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const winnerIndex = body.winnerIndex;
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (winnerIndex !== 0 && winnerIndex !== 1 || !reason) {
      return new Response("Bad request", { status: 400 });
    }

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

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [`player-${playerIndex}`]);

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
    if (this.gameState!.pendingPrompt?.respondingPlayer === playerIndex) {
      const playerWs = this.getWebSocketForPlayer(playerIndex as 0 | 1);
      if (playerWs) {
        this.send(playerWs, {
          type: "game:prompt",
          promptType: this.gameState!.pendingPrompt.promptType,
          options: this.gameState!.pendingPrompt.options,
        });
      }
    }

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

    if (clientMsg.type === "game:leave") {
      await this.handlePlayerAway(playerIndex, "LEFT", ws);
      try { ws.close(1000, "left"); } catch { /* ignore */ }
      return;
    }

    if (clientMsg.type === "game:action") {
      await this.handleAction(ws, playerIndex, clientMsg.action);
    }
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

    const playerIndex = parseInt(playerTag.replace("player-", "")) as 0 | 1;
    if (!this.gameState.players[playerIndex].connected) return;
    await this.handlePlayerAway(playerIndex, "DISCONNECTED", ws);
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

    // If an effect is awaiting player input, only allow prompt responses
    if (this.gameState.pendingPrompt) {
      const isPromptResponse =
        action.type === "SELECT_TARGET" ||
        action.type === "PLAYER_CHOICE" ||
        action.type === "ARRANGE_TOP_CARDS" ||
        action.type === "PASS";
      if (isPromptResponse) {
        if (playerIndex !== this.gameState.pendingPrompt.respondingPlayer) {
          this.send(ws, { type: "game:error", message: "Waiting for opponent to respond to prompt" });
          return;
        }
        await this.resumeFromPrompt(ws, playerIndex, action);
        return;
      }
      // REVEAL_TRIGGER is a "fire-through" prompt — clear it and let the
      // action proceed through the normal pipeline so executeRevealTrigger runs.
      if (action.type === "REVEAL_TRIGGER") {
        this.gameState = { ...this.gameState, pendingPrompt: null };
        // Fall through to pipeline processing below
      } else if (action.type !== "CONCEDE") {
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

      const expectedPlayer = inactiveActions.has(action.type)
        ? (this.gameState.turn.activePlayerIndex === 0 ? 1 : 0)
        : this.gameState.turn.activePlayerIndex;

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
    _ws: WebSocket,
    _playerIndex: 0 | 1,
    action: GameAction,
  ): Promise<void> {
    if (!this.gameState || !this.cardDb) return;

    // Effect resolution means game state has progressed — undo no longer valid
    this.undoHistory = [];

    const prompt = this.gameState.pendingPrompt!;
    const resumeCtx = prompt.resumeContext as unknown as Record<string, unknown>;

    // Clear the pending prompt before resuming
    this.gameState = { ...this.gameState, pendingPrompt: null };

    // Route to the appropriate resume handler based on context type
    if (resumeCtx?.type === "REPLACEMENT") {
      const accepted = action.type !== "PASS";
      const replacementResult = resumeReplacement(
        this.gameState,
        resumeCtx as unknown as ReplacementResumeContext,
        accepted,
        this.cardDb,
      );
      this.gameState = replacementResult.state;

      if (replacementResult.pendingPrompt) {
        this.gameState = { ...this.gameState, pendingPrompt: replacementResult.pendingPrompt };
      }
    } else if (this.gameState.effectStack.length > 0) {
      // Stack-based resume — use new effect stack system
      const resumeResult = resumeFromStack(this.gameState, action, this.cardDb);
      this.gameState = resumeResult.state;

      if (resumeResult.pendingPrompt) {
        this.gameState = { ...this.gameState, pendingPrompt: resumeResult.pendingPrompt };
      }
    } else {
      // Legacy: bare ResumeContext (no stack frame) — fallback for backward compat
      const effectResumeCtx = resumeCtx as unknown as ResumeContext;
      const resumeResult = resumeEffectChain(this.gameState, effectResumeCtx, action, this.cardDb);
      this.gameState = resumeResult.state;

      if (resumeResult.pendingPrompt) {
        this.gameState = { ...this.gameState, pendingPrompt: resumeResult.pendingPrompt };
      }
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
    this.broadcastFilteredState((s) => ({ type: "game:update", action, state: s }));

    if (this.gameState.pendingPrompt) {
      this.sendEffectPrompt(this.gameState.pendingPrompt);
    } else {
      this.sendPendingPrompts();
    }
  }

  private sendEffectPrompt(prompt: PendingPromptState): void {
    const playerWs = this.getWebSocketForPlayer(prompt.respondingPlayer);
    if (playerWs) {
      this.send(playerWs, {
        type: "game:prompt",
        promptType: prompt.promptType,
        options: prompt.options,
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
          promptType: "SELECT_BLOCKER",
          options: { validTargets: blockers, optional: true, timeoutMs: 30_000 },
        });
      }
    } else if (battleSubPhase === "DAMAGE_STEP" && battle && "pendingTriggerLifeCard" in battle) {
      const inactiveWs = this.getWebSocketForPlayer(inactiveIdx);
      if (inactiveWs) {
        const triggerLifeCard = (battle as any).pendingTriggerLifeCard;
        const triggerCardData = triggerLifeCard && this.cardDb
          ? this.cardDb.get(triggerLifeCard.cardId)
          : undefined;
        // Build a CardInstance-like object for the client to display
        const triggerCards = triggerLifeCard ? [{
          instanceId: triggerLifeCard.instanceId,
          cardId: triggerLifeCard.cardId,
          zone: "LIFE" as const,
          state: "ACTIVE" as const,
          attachedDon: [] as any[],
          turnPlayed: null,
          controller: inactiveIdx as 0 | 1,
          owner: inactiveIdx as 0 | 1,
        }] : [];
        const effectDescription = triggerCardData?.triggerText
          ?? triggerCardData?.effectText
          ?? "You may reveal this Trigger card to activate its effect";
        this.send(inactiveWs, {
          type: "game:prompt",
          promptType: "REVEAL_TRIGGER",
          options: {
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
   * If the effect stack is empty and no prompt is pending, check whether the
   * battle has a pendingTriggerLifeCard that needs a REVEAL_TRIGGER prompt.
   * Surfacing it as a durable pendingPrompt on the game state makes it survive
   * reconnections and prevents a race between game:update (clears activePrompt)
   * and game:prompt (sets it again).
   */
  private surfaceRevealTriggerIfNeeded(): void {
    if (!this.gameState || !this.cardDb) return;
    if (this.gameState.pendingPrompt) return;
    if (this.gameState.effectStack.length > 0) return;

    const { battleSubPhase, battle } = this.gameState.turn;
    if (battleSubPhase !== "DAMAGE_STEP" || !battle) return;

    const triggerLifeCard = (battle as any).pendingTriggerLifeCard;
    if (!triggerLifeCard) return;

    const inactiveIdx = (this.gameState.turn.activePlayerIndex === 0 ? 1 : 0) as 0 | 1;
    const triggerCardData = this.cardDb.get(triggerLifeCard.cardId);

    const cards = [{
      instanceId: triggerLifeCard.instanceId,
      cardId: triggerLifeCard.cardId,
      zone: "LIFE" as const,
      state: "ACTIVE" as const,
      attachedDon: [] as any[],
      turnPlayed: null,
      controller: inactiveIdx,
      owner: inactiveIdx,
    }];

    const effectDescription = triggerCardData?.triggerText
      ?? triggerCardData?.effectText
      ?? "You may reveal this Trigger card to activate its effect";

    this.gameState = {
      ...this.gameState,
      pendingPrompt: {
        promptType: "REVEAL_TRIGGER" as const,
        options: { cards, effectDescription, optional: false, timeoutMs: 30_000 },
        respondingPlayer: inactiveIdx,
        resumeContext: null as any,
      },
    };
  }

  // ─── Token validation ──────────────────────────────────────────────────────

  private async validateToken(token: string): Promise<0 | 1 | null> {
    const userId = await verifyGameToken(token, this.env.GAME_WORKER_SECRET);
    if (!userId || !this.gameState) return null;

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
      undoHistory: this.undoHistory,
    };
    await this.state.storage.put("session", stored);
  }

  private async loadFromStorage(): Promise<boolean> {
    const stored = await this.state.storage.get<StoredSession>("session");
    if (!stored) return false;

    this.gameState = stored.state;
    this.cardDb = new Map(Object.entries(stored.cardDb));
    this.mulliganDone = stored.mulliganDone;
    this.undoHistory = stored.undoHistory ?? [];
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
    for (const playerIndex of [0, 1] as const) {
      const ws = this.getWebSocketForPlayer(playerIndex);
      if (!ws || ws === exclude) continue;
      const filtered = filterStateForPlayer(this.gameState!, playerIndex);
      this.send(ws, build(filtered));
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


