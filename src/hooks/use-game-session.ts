"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWs } from "@/hooks/use-game-ws";
import { useCardDatabase } from "@/hooks/use-card-database";
import { useRemoteGameStatus } from "@/hooks/use-remote-game-status";
import { useGameFinalizer } from "@/hooks/use-game-finalizer";
import type {
  CardDb,
  GameAction,
  GameState,
  PlayerState,
  PromptOptions,
  TurnState,
} from "@shared/game-types";
import type { RemoteGameStatus } from "@/hooks/use-remote-game-status";

export interface GameSessionGame {
  gameState: GameState | null;
  cardDb: CardDb;
  cardDbReady: boolean;
  connectionStatus: string;
  lastError: string | null;
  activePrompt: PromptOptions | null;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  sendAction: (action: GameAction) => void;
  myIndex: 0 | 1 | null;
  me: PlayerState | null;
  opp: PlayerState | null;
  turn: TurnState | null;
  isMyTurn: boolean;
  phase: string;
  battlePhase: string | null;
  inBattle: boolean;
  matchClosed: boolean;
  canUndo: boolean;
  retryConnection: () => void;
  connectivityFailed: boolean;
}

export interface GameSessionOpponent {
  opponentAway: boolean;
  opponentAwayText: string;
  gamePausedForOpponent: boolean;
  opponentDeadlineRemaining: number | null;
}

export interface GameSessionNavigation {
  remoteGameStatus: RemoteGameStatus | null;
  fallbackConcedeAvailable: boolean;
  fallbackSubmitting: boolean;
  fallbackError: string | null;
  handleFallbackConcede: () => Promise<void>;
  leavingGame: boolean;
  leaveError: string | null;
  handleLeaveGame: () => Promise<void>;
  handleBackToLobbies: () => Promise<void>;
}

export interface GameSessionEndState {
  endTitle: string;
  endColorClass: string;
  endReason: string;
}

export function useGameSession(
  gameId: string,
  workerUrl: string,
) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  const getToken = useCallback(async () => {
    const r = await fetch("/api/game/token");
    if (!r.ok) throw new Error(`Token fetch: ${r.status}`);
    const d = (await r.json()) as { data?: { token?: string } };
    if (!d.data?.token) throw new Error("No token");
    return d.data.token;
  }, []);

  /* ── WebSocket ────────────────────────────────────────────────────── */

  const {
    gameState,
    connectionStatus,
    lastError,
    activePrompt,
    gameOver,
    canUndo,
    sendAction: rawSendAction,
    leaveGame,
    retryConnection,
  } = useGameWs(gameId, workerUrl, getToken);

  // Suppress duplicate identical actions fired within a short window. Rapid
  // clicks (or double-trigger from keyboard + click) can otherwise send the
  // same action twice before the server responds, causing desync.
  const lastSendRef = useRef<{ signature: string; at: number } | null>(null);
  const sendAction = useCallback((action: GameAction) => {
    const signature = JSON.stringify(action);
    const now = Date.now();
    const last = lastSendRef.current;
    if (last && last.signature === signature && now - last.at < 250) {
      return;
    }
    lastSendRef.current = { signature, at: now };
    rawSendAction(action);
  }, [rawSendAction]);

  /* ── Card DB ──────────────────────────────────────────────────────── */

  const { cardDb, cardDbReady, cardDbError, retryFetchCards } = useCardDatabase(
    gameId,
    workerUrl,
    getToken,
  );

  // Single retry entry point for the UI. Re-runs whichever subsystem is
  // currently broken; each call is idempotent.
  const retryConnectivity = useCallback(() => {
    if (cardDbError) retryFetchCards();
    retryConnection();
  }, [cardDbError, retryFetchCards, retryConnection]);

  /* ── Remote game status polling ───────────────────────────────────── */

  const { remoteGameStatus, setRemoteGameStatus } =
    useRemoteGameStatus(gameId);

  /* ── Player derivation ────────────────────────────────────────────── */

  const myIndex = gameState
    ? ((gameState.players[0].playerId === userId ? 0 : 1) as 0 | 1)
    : null;
  const oppIndex: 0 | 1 | null =
    myIndex !== null ? (myIndex === 0 ? 1 : 0) : null;
  const me =
    myIndex !== null && gameState ? gameState.players[myIndex] : null;
  const opp =
    oppIndex !== null && gameState ? gameState.players[oppIndex] : null;
  const turn = gameState?.turn ?? null;
  const isMyTurn =
    myIndex !== null && turn ? turn.activePlayerIndex === myIndex : false;
  const phase = turn?.phase ?? "";
  const battlePhase = turn?.battleSubPhase ?? null;
  const inBattle = !!battlePhase;

  /* ── Opponent away / disconnect ───────────────────────────────────── */

  const [now, setNow] = useState(() => Date.now());
  const opponentAway = !!opp && !opp.connected;
  const opponentDeadlineRemaining = opp?.rejoinDeadlineAt
    ? Math.max(0, opp.rejoinDeadlineAt - now)
    : null;
  const opponentAwayText =
    opp?.awayReason === "LEFT"
      ? "Opponent left the game."
      : "Opponent disconnected.";
  const gamePausedForOpponent =
    opponentAway &&
    (turn?.activePlayerIndex === oppIndex ||
      battlePhase === "BLOCK_STEP" ||
      battlePhase === "COUNTER_STEP" ||
      battlePhase === "DAMAGE_STEP");

  useEffect(() => {
    if (
      !gameState?.players.some(
        (player) => player.rejoinDeadlineAt !== null && !player.connected,
      )
    ) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  /* ── Match closed ─────────────────────────────────────────────────── */

  const resolvedWithoutSocket = Boolean(
    !gameOver &&
      remoteGameStatus &&
      remoteGameStatus.status !== "IN_PROGRESS",
  );
  const stateFinished =
    gameState?.status === "FINISHED" || gameState?.status === "ABANDONED";
  const matchClosed = Boolean(
    gameOver || resolvedWithoutSocket || stateFinished,
  );

  const fallbackConcedeAvailable =
    !gameState &&
    connectionStatus !== "connecting" &&
    remoteGameStatus?.status === "IN_PROGRESS" &&
    !!remoteGameStatus.canFallbackConcede;

  /* ── Finalize / leave handlers ────────────────────────────────────── */

  const {
    leavingGame,
    leaveError,
    fallbackSubmitting,
    fallbackError,
    handleBackToLobbies,
    handleLeaveGame,
    handleFallbackConcede,
  } = useGameFinalizer({
    gameId,
    gameState,
    gameOver,
    matchClosed,
    leaveGame,
    setRemoteGameStatus,
  });

  /* ── End-of-match display values ──────────────────────────────────── */

  const endTitle = gameOver
    ? gameOver.winner === null
      ? "DRAW"
      : gameOver.winner === myIndex
        ? "VICTORY"
        : "DEFEAT"
    : remoteGameStatus?.winnerPerspective === "SELF"
      ? "VICTORY"
      : remoteGameStatus?.winnerPerspective === "NONE"
        ? "MATCH ENDED"
        : "DEFEAT";

  const endColorClass = gameOver
    ? gameOver.winner === myIndex
      ? "text-gb-accent-green"
      : gameOver.winner === null
        ? "text-gb-accent-amber"
        : "text-gb-accent-red"
    : remoteGameStatus?.winnerPerspective === "SELF"
      ? "text-gb-accent-green"
      : remoteGameStatus?.winnerPerspective === "NONE"
        ? "text-gb-accent-amber"
        : "text-gb-accent-red";

  const endReason =
    gameOver?.reason ??
    remoteGameStatus?.winReason ??
    "The game has ended.";

  return {
    game: {
      gameState,
      cardDb,
      cardDbReady,
      connectionStatus,
      lastError: lastError ?? cardDbError,
      activePrompt,
      gameOver,
      sendAction,
      myIndex,
      me,
      opp,
      turn,
      isMyTurn,
      phase,
      battlePhase,
      inBattle,
      matchClosed,
      canUndo,
      retryConnection: retryConnectivity,
      connectivityFailed:
        connectionStatus === "failed" || cardDbError !== null,
    },
    opponent: {
      opponentAway,
      opponentAwayText,
      gamePausedForOpponent,
      opponentDeadlineRemaining,
    },
    navigation: {
      remoteGameStatus,
      fallbackConcedeAvailable,
      fallbackSubmitting,
      fallbackError,
      handleFallbackConcede,
      leavingGame,
      leaveError,
      handleLeaveGame,
      handleBackToLobbies,
    },
    endState: {
      endTitle,
      endColorClass,
      endReason,
    },
  };
}
