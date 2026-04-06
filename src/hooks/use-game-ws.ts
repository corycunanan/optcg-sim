"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameState,
  GameAction,
  PromptType,
  PromptOptions,
  ServerMessage,
} from "@shared/game-types";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseGameWsReturn {
  gameState: GameState | null;
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  sendAction: (action: GameAction) => void;
  leaveGame: () => Promise<void>;
}

/**
 * useGameWs — manages the WebSocket connection to the Cloudflare game DO.
 *
 * Accepts a `getToken` async function instead of a static token string.
 * This is critical: the HS256 token expires after 5 minutes, and every
 * reconnect attempt fetches a fresh one, preventing the stale-token
 * reconnect loop that caused "cannot rejoin" failures.
 */
export function useGameWs(
  gameId: string,
  workerUrl: string,
  getToken: () => Promise<string>,
): UseGameWsReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<{ promptType: PromptType; options: PromptOptions } | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: 0 | 1 | null; reason: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const unmountedRef = useRef(false);
  const manualCloseRef = useRef(false);

  const connect = useCallback(async function connectImpl() {
    if (!gameId || !workerUrl) return;
    if (unmountedRef.current) return;
    manualCloseRef.current = false;

    // Always fetch a fresh token on every connect attempt.
    // The token expires in 5 min; reusing a stale token on reconnect causes 401 loops.
    let token: string;
    try {
      token = await getToken();
    } catch {
      if (unmountedRef.current) return;
      setConnectionStatus("error");
      setLastError("Failed to get auth token");
      const delay = Math.min(5000 * Math.pow(2, reconnectAttemptsRef.current), 60000);
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => { void connectImpl(); }, delay);
      return;
    }

    if (unmountedRef.current) return;

    const url = `${workerUrl}/game/${gameId}/ws?token=${encodeURIComponent(token)}`;
    const wsUrl = url.replace(/^http/, "ws");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnectionStatus("connecting");

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "game:state":
          setGameState(msg.state);
          if (msg.state.pendingPrompt) {
            setActivePrompt({
              promptType: msg.state.pendingPrompt.promptType,
              options: msg.state.pendingPrompt.options,
            });
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
          if (msg.state.pendingPrompt) {
            setActivePrompt({
              promptType: msg.state.pendingPrompt.promptType,
              options: msg.state.pendingPrompt.options,
            });
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
        case "game:prompt":
          setActivePrompt({ promptType: msg.promptType, options: msg.options });
          break;
        case "game:error":
          setLastError(msg.message);
          break;
        case "game:over":
          setGameOver({ winner: msg.winner, reason: msg.reason });
          break;
        case "game:player_disconnected":
        case "game:player_reconnected":
          // Game state update (connected flag) will arrive via next broadcast
          break;
      }
    };

    ws.onerror = () => {
      if (!unmountedRef.current) setConnectionStatus("error");
    };

    ws.onclose = () => {
      if (unmountedRef.current || manualCloseRef.current) return;
      setConnectionStatus("disconnected");
      wsRef.current = null;

      // Exponential backoff; fresh token fetched on each attempt via connect()
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => { void connectImpl(); }, delay);
    };
  }, [gameId, workerUrl, getToken]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // suppress reconnect on intentional unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendAction = useCallback((action: GameAction) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLastError("Not connected");
      return;
    }
    ws.send(JSON.stringify({ type: "game:action", action }));
    setLastError(null);
  }, []);

  const leaveGame = useCallback(async () => {
    manualCloseRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.onclose = null;
      ws.send(JSON.stringify({ type: "game:leave" }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      ws.close();
    } else if (ws) {
      ws.onclose = null;
      ws.close();
    }

    wsRef.current = null;
    setConnectionStatus("disconnected");
  }, []);

  return { gameState, connectionStatus, lastError, activePrompt, gameOver, sendAction, leaveGame };
}
