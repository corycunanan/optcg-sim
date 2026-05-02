"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  GameState,
  GameAction,
  PromptOptions,
  ServerMessage,
} from "@shared/game-types";
import {
  useAuthedWebSocket,
  type ConnectionStatus,
} from "@/hooks/use-authed-websocket";

export type { ConnectionStatus };

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

  const url = useMemo(
    () => (gameId && workerUrl ? `${workerUrl}/game/${gameId}/ws` : null),
    [gameId, workerUrl],
  );

  const onMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "game:state":
        setGameState(msg.state);
        setCanUndo(msg.canUndo ?? false);
        if (msg.state.pendingPrompt) {
          setActivePrompt(msg.state.pendingPrompt.options);
        }
        if (msg.state.status !== "IN_PROGRESS") {
          setGameOver({
            winner: msg.state.winner,
            reason: msg.state.winReason ?? "Game over",
          });
        }
        break;
      case "game:update":
        setGameState(msg.state);
        setCanUndo(msg.canUndo ?? false);
        if (msg.state.pendingPrompt) {
          setActivePrompt(msg.state.pendingPrompt.options);
        } else {
          setActivePrompt(null);
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
        break;
      case "game:error":
        setGameError(msg.message);
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
      send({ type: "game:action", action });
      // Mirror the original setLastError(null) on send: clear any stale game
      // error so the user sees the freshest state. Transport errors are
      // managed by useAuthedWebSocket and will repopulate if send failed.
      setGameError(null);
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
    activePrompt,
    gameOver,
    canUndo,
    sendAction,
    leaveGame,
    retryConnection,
  };
}
