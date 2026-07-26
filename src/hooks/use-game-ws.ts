"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GameState,
  GameAction,
  PromptOptions,
  ServerMessage,
} from "@shared/game-types";
import { useAuthedWebSocket } from "@/hooks/use-authed-websocket";
import { GameServerMessageSchema } from "@/lib/validators/realtime";
import { toast } from "sonner";

export interface ActionRejection {
  action: GameAction;
  reason: string;
  sequence: number;
}

export interface AcceptedGameUpdate {
  action?: GameAction;
  sequence: number;
}

const PROMPT_RESPONSE_TYPES = new Set<GameAction["type"]>([
  "ARRANGE_TOP_CARDS",
  "PLAYER_CHOICE",
  "REDISTRIBUTE_DON",
  "REVEAL_TRIGGER",
  "SELECT_TARGET",
  "PASS",
]);

const SPECTATOR_TOAST_BATCH_MS = 500;
const SPECTATOR_RECONNECT_WINDOW_MS = 5_000;
const SPECTATOR_CHURN_COOLDOWN_MS = 30_000;

type SpectatorLifecycleEvent = Extract<
  ServerMessage,
  { type: "game:spectator_joined" | "game:spectator_left" }
>;

class SpectatorLifecycleToasts {
  private batch = this.createBatch();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly recentDepartures = new Map<string, number>();
  private readonly churnCooldowns = new Map<string, number>();

  queue(event: SpectatorLifecycleEvent): void {
    const now = Date.now();
    const { id, displayName } = event.spectator;
    this.prune(now);

    if (event.type === "game:spectator_left" && event.cause === "EJECTED") {
      this.batch.joined.delete(id);
      this.batch.departed.delete(id);
      this.batch.ejected.set(id, displayName);
      this.recentDepartures.delete(id);
      this.churnCooldowns.delete(id);
      this.schedule();
      return;
    }

    if ((this.churnCooldowns.get(id) ?? 0) > now) return;

    if (event.type === "game:spectator_joined") {
      const departedAt = this.recentDepartures.get(id);
      if (
        departedAt !== undefined &&
        now - departedAt <= SPECTATOR_RECONNECT_WINDOW_MS
      ) {
        this.batch.departed.delete(id);
        this.recentDepartures.delete(id);
        this.churnCooldowns.set(id, now + SPECTATOR_CHURN_COOLDOWN_MS);
        return;
      }
      this.batch.joined.set(id, displayName);
    } else {
      this.recentDepartures.set(id, now);
      this.batch.departed.set(id, displayName);
    }
    this.schedule();
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => this.flush(), SPECTATOR_TOAST_BATCH_MS);
  }

  private flush(): void {
    const batch = this.batch;
    this.batch = this.createBatch();
    this.timer = null;
    this.toastBatch(
      batch.joined,
      (name) => `${name} started spectating`,
      (count) => `${count} spectators started spectating`
    );
    this.toastBatch(
      batch.departed,
      (name) => `${name} stopped spectating`,
      (count) => `${count} spectators stopped spectating`
    );
    this.toastBatch(
      batch.ejected,
      (name) => `${name} was removed from spectating`,
      (count) => `${count} spectators were removed from spectating`
    );
  }

  private toastBatch(
    spectators: Map<string, string>,
    singular: (name: string) => string,
    plural: (count: number) => string
  ): void {
    if (spectators.size === 0) return;
    toast.info(
      spectators.size === 1
        ? singular(spectators.values().next().value ?? "Spectator")
        : plural(spectators.size)
    );
  }

  private prune(now: number): void {
    for (const [id, departedAt] of this.recentDepartures) {
      if (now - departedAt > SPECTATOR_RECONNECT_WINDOW_MS) {
        this.recentDepartures.delete(id);
      }
    }
    for (const [id, suppressedUntil] of this.churnCooldowns) {
      if (suppressedUntil <= now) this.churnCooldowns.delete(id);
    }
  }

  private createBatch() {
    return {
      joined: new Map<string, string>(),
      departed: new Map<string, string>(),
      ejected: new Map<string, string>(),
    };
  }
}

function preserveUnchangedPlayerReferences(
  previousState: GameState | null,
  nextState: GameState
): GameState {
  if (!previousState) return nextState;

  // Both slices came from JSON WebSocket payloads, so equal serializations
  // imply equal renderable contents. Serialize each slice once per update;
  // differing key order can only cause a conservative missed reuse.
  const previousPlayers = previousState.players.map((player) =>
    JSON.stringify(player)
  );
  const nextPlayers = nextState.players.map((player) => JSON.stringify(player));
  const players: GameState["players"] = [
    previousPlayers[0] === nextPlayers[0]
      ? previousState.players[0]
      : nextState.players[0],
    previousPlayers[1] === nextPlayers[1]
      ? previousState.players[1]
      : nextState.players[1],
  ];

  return players[0] === nextState.players[0] &&
    players[1] === nextState.players[1]
    ? nextState
    : { ...nextState, players };
}

/**
 * useGameWs — manages the WebSocket connection to the Cloudflare game DO.
 *
 * Transport (token refetch, reconnect, supersede-safe close) is delegated to
 * `useAuthedWebSocket`. This hook owns the game-specific message vocabulary
 * and the `sendAction` / `leaveGame` semantics.
 */
export function useGameWs(
  gameId: string,
  workerUrl: string,
  getToken: () => Promise<string>
) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [activePrompt, setActivePrompt] = useState<PromptOptions | null>(null);
  const [gameOver, setGameOver] = useState<{
    winner: 0 | 1 | null;
    reason: string;
  } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const activePromptIdRef = useRef<string | null>(null);
  const rejectionSequenceRef = useRef(0);
  const [actionRejection, setActionRejection] =
    useState<ActionRejection | null>(null);
  const acceptedUpdateSequenceRef = useRef(0);
  const [acceptedUpdate, setAcceptedUpdate] =
    useState<AcceptedGameUpdate | null>(null);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const spectatorToastsRef = useRef<SpectatorLifecycleToasts | null>(null);
  if (spectatorToastsRef.current === null) {
    spectatorToastsRef.current = new SpectatorLifecycleToasts();
  }

  useEffect(() => {
    return () => spectatorToastsRef.current?.dispose();
  }, []);

  const url = useMemo(
    () => (gameId && workerUrl ? `${workerUrl}/game/${gameId}/ws` : null),
    [gameId, workerUrl]
  );

  const onMessage = useCallback((raw: unknown) => {
    const parsed = GameServerMessageSchema.safeParse(raw);
    if (!parsed.success) {
      setGameError("Game server sent an invalid message");
      return;
    }
    const msg: ServerMessage = parsed.data;
    switch (msg.type) {
      case "game:state":
        setActionRejection(null);
        setGameState(msg.state);
        setCanUndo(msg.canUndo ?? false);
        if (msg.state.pendingPrompt) {
          setActivePrompt(msg.state.pendingPrompt.options);
          const promptId = msg.state.pendingPrompt.promptId ?? null;
          setActivePromptId(promptId);
          activePromptIdRef.current = promptId;
        } else {
          setActivePromptId(null);
          activePromptIdRef.current = null;
        }
        if (msg.state.status !== "IN_PROGRESS") {
          setGameOver({
            winner: msg.state.winner,
            reason: msg.state.winReason ?? "Game over",
          });
        }
        break;
      case "game:update":
        setActionRejection(null);
        acceptedUpdateSequenceRef.current += 1;
        setAcceptedUpdate({
          action: msg.action,
          sequence: acceptedUpdateSequenceRef.current,
        });
        setGameState((previousState) =>
          preserveUnchangedPlayerReferences(previousState, msg.state)
        );
        setCanUndo(msg.canUndo ?? false);
        if (msg.state.pendingPrompt) {
          setActivePrompt(msg.state.pendingPrompt.options);
          const promptId = msg.state.pendingPrompt.promptId ?? null;
          setActivePromptId(promptId);
          activePromptIdRef.current = promptId;
        } else {
          setActivePrompt(null);
          setActivePromptId(null);
          activePromptIdRef.current = null;
        }
        if (msg.state.status !== "IN_PROGRESS") {
          setGameOver({
            winner: msg.state.winner,
            reason: msg.state.winReason ?? "Game over",
          });
        }
        break;
      case "game:undo":
        setCanUndo(msg.canUndo);
        break;
      case "game:prompt":
        setActivePrompt(msg.options);
        setActivePromptId(msg.promptId ?? null);
        activePromptIdRef.current = msg.promptId ?? null;
        break;
      case "game:error":
        setGameError(msg.message);
        break;
      case "action:rejected":
        rejectionSequenceRef.current += 1;
        setActionRejection({
          action: msg.action,
          reason: msg.reason,
          sequence: rejectionSequenceRef.current,
        });
        break;
      case "game:over":
        setGameOver({ winner: msg.winner, reason: msg.reason });
        break;
      case "game:player_disconnected":
      case "game:player_reconnected":
        // Game state update (connected flag) will arrive via next broadcast
        break;
      case "game:spectator_joined":
        spectatorToastsRef.current?.queue(msg);
        break;
      case "game:spectator_left":
        spectatorToastsRef.current?.queue(msg);
        break;
    }
  }, []);

  const {
    connectionStatus,
    lastError: transportError,
    send,
    retry,
    close,
  } = useAuthedWebSocket<ServerMessage>({
    url,
    getToken,
    onMessage,
  });

  const sendAction = useCallback(
    (action: GameAction) => {
      const promptId = activePromptIdRef.current;
      const identifiedAction =
        promptId && PROMPT_RESPONSE_TYPES.has(action.type)
          ? { ...action, promptId }
          : action;
      send({ type: "game:action", action: identifiedAction });
      // Keep the last rejection visible while this attempt is pending. The
      // next accepted state update clears it; another rejection supersedes it.
    },
    [send]
  );

  const leaveGame = useCallback(async () => {
    if (connectionStatus === "connected") {
      send({ type: "game:leave" });
      // Give the worker a moment to receive game:leave before tearing down.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await close();
  }, [connectionStatus, send, close]);

  const retryConnection = useCallback(() => {
    setGameError(null);
    retry();
  }, [retry]);

  const lastError = gameError ?? transportError;

  return {
    gameState,
    connectionStatus,
    lastError,
    actionRejection,
    acceptedUpdate,
    activePrompt,
    activePromptId,
    gameOver,
    canUndo,
    sendAction,
    leaveGame,
    retryConnection,
  };
}
