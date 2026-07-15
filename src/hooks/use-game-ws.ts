"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  GameState,
  GameAction,
  PromptOptions,
  ServerMessage,
} from "@shared/game-types";
import { useAuthedWebSocket } from "@/hooks/use-authed-websocket";

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
  getToken: () => Promise<string>,
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

  const url = useMemo(
    () => (gameId && workerUrl ? `${workerUrl}/game/${gameId}/ws` : null),
    [gameId, workerUrl],
  );

  const onMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "game:state":
        setActionRejection(null);
        setGameState(msg.state);
        setCanUndo(msg.canUndo ?? false);
        if (msg.state.pendingPrompt) {
          setActivePrompt(msg.state.pendingPrompt.options);
          activePromptIdRef.current = msg.state.pendingPrompt.promptId ?? null;
        } else {
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
        setGameState(msg.state);
        setCanUndo(msg.canUndo ?? false);
        if (msg.state.pendingPrompt) {
          setActivePrompt(msg.state.pendingPrompt.options);
          activePromptIdRef.current = msg.state.pendingPrompt.promptId ?? null;
        } else {
          setActivePrompt(null);
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
    [send],
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
    gameOver,
    canUndo,
    sendAction,
    leaveGame,
    retryConnection,
  };
}
