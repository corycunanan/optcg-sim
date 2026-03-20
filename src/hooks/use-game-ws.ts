"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Mirror the minimal types we need from the worker (avoid importing the worker package)
export type Zone =
  | "LEADER" | "CHARACTER" | "STAGE" | "COST_AREA" | "HAND"
  | "DECK" | "TRASH" | "LIFE" | "DON_DECK" | "REMOVED_FROM_GAME";

export type Phase = "REFRESH" | "DRAW" | "DON" | "MAIN" | "END";
export type BattleSubPhase =
  | "ATTACK_STEP" | "BLOCK_STEP" | "COUNTER_STEP" | "DAMAGE_STEP" | "END_OF_BATTLE";

export interface CardInstance {
  instanceId: string;
  cardId: string;
  zone: Zone;
  state: "ACTIVE" | "RESTED";
  attachedDon: DonInstance[];
  turnPlayed: number | null;
  controller: 0 | 1;
  owner: 0 | 1;
}

export interface LifeCard {
  instanceId: string;
  cardId: string;
  face: "UP" | "DOWN";
}

export interface DonInstance {
  instanceId: string;
  state: "ACTIVE" | "RESTED";
  attachedTo: string | null;
}

export interface PlayerState {
  playerId: string;
  leader: CardInstance;
  hand: CardInstance[];
  deck: CardInstance[];
  life: LifeCard[];
  characters: CardInstance[];
  stage: CardInstance | null;
  donDeck: DonInstance[];
  donCostArea: DonInstance[];
  trash: CardInstance[];
  removedFromGame: CardInstance[];
  connected: boolean;
}

export interface TurnState {
  number: number;
  activePlayerIndex: 0 | 1;
  phase: Phase;
  battleSubPhase: BattleSubPhase | null;
  battle: unknown | null;
  oncePerTurnUsed: Record<string, string[]>;
  actionsPerformedThisTurn: { actionType: string; timestamp: number }[];
}

export interface GameState {
  id: string;
  players: [PlayerState, PlayerState];
  turn: TurnState;
  activeEffects: unknown[];
  prohibitions: unknown[];
  scheduledActions: unknown[];
  oneTimeModifiers: unknown[];
  triggerRegistry: unknown[];
  eventLog: unknown[];
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winner: 0 | 1 | null;
  winReason: string | null;
}

export type GameAction =
  | { type: "ADVANCE_PHASE" }
  | { type: "PLAY_CARD"; cardInstanceId: string; position?: number }
  | { type: "ATTACH_DON"; targetInstanceId: string; count: number }
  | { type: "DECLARE_ATTACK"; attackerInstanceId: string; targetInstanceId: string }
  | { type: "DECLARE_BLOCKER"; blockerInstanceId: string }
  | { type: "USE_COUNTER"; cardInstanceId: string; counterTargetInstanceId: string }
  | { type: "USE_COUNTER_EVENT"; cardInstanceId: string; counterTargetInstanceId: string }
  | { type: "REVEAL_TRIGGER"; reveal: boolean }
  | { type: "PASS" }
  | { type: "CONCEDE" }
  | { type: "MANUAL_EFFECT"; description: string };

export type PromptType =
  | "SELECT_BLOCKER"
  | "SELECT_COUNTER_TARGET"
  | "SELECT_ATTACK_TARGET"
  | "REVEAL_TRIGGER"
  | "SELECT_CARD_TO_TRASH";

export interface PromptOptions {
  validTargets?: string[];
  optional?: boolean;
  timeoutMs?: number;
}

type ServerMessage =
  | { type: "game:state"; state: GameState }
  | { type: "game:update"; action: GameAction; state: GameState }
  | { type: "game:prompt"; promptType: PromptType; options: PromptOptions }
  | { type: "game:error"; message: string }
  | { type: "game:over"; winner: 0 | 1 | null; reason: string };

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface UseGameWsReturn {
  gameState: GameState | null;
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  playerIndex: 0 | 1 | null;
  sendAction: (action: GameAction) => void;
}

export function useGameWs(
  gameId: string,
  workerUrl: string,
  token: string,  // userId (stub) or JWT in production
  playerIndex: 0 | 1 | null,
): UseGameWsReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<{ promptType: PromptType; options: PromptOptions } | null>(null);
  const [gameOver, setGameOver] = useState<{ winner: 0 | 1 | null; reason: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!token || !gameId || !workerUrl) return;

    const url = `${workerUrl}/game/${gameId}/ws?token=${encodeURIComponent(token)}`;
    // Use wss:// for production, ws:// for localhost
    const wsUrl = url.replace(/^http/, "ws");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnectionStatus("connecting");

    ws.onopen = () => {
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
          break;
        case "game:update":
          setGameState(msg.state);
          setActivePrompt(null);
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
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      wsRef.current = null;

      // Exponential backoff reconnect (max 30s)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [gameId, workerUrl, token]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
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

  return {
    gameState,
    connectionStatus,
    lastError,
    activePrompt,
    gameOver,
    playerIndex,
    sendAction,
  };
}
