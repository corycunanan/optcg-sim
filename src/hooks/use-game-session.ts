"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWs } from "@/hooks/use-game-ws";
import type {
  CardData,
  GameAction,
  GameState,
  PlayerState,
  PromptOptions,
  PromptType,
  TurnState,
} from "@shared/game-types";

type CardDb = Record<string, CardData>;

interface RemoteGameStatus {
  id: string;
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  winnerId: string | null;
  winReason: string | null;
  winnerPerspective: "SELF" | "OPPONENT" | "NONE";
  canFallbackConcede: boolean;
  playerIndex?: 0 | 1;
}

export interface UseGameSessionReturn {
  gameState: GameState | null;
  cardDb: CardDb;
  connectionStatus: string;
  lastError: string | null;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
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

  opponentAway: boolean;
  opponentAwayText: string;
  gamePausedForOpponent: boolean;
  opponentDeadlineRemaining: number | null;

  remoteGameStatus: RemoteGameStatus | null;
  fallbackConcedeAvailable: boolean;
  fallbackSubmitting: boolean;
  fallbackError: string | null;
  handleFallbackConcede: () => Promise<void>;

  leavingGame: boolean;
  leaveError: string | null;
  handleLeaveGame: () => Promise<void>;
  handleBackToLobbies: () => Promise<void>;

  endTitle: string;
  endColorClass: string;
  endReason: string;
}

export function useGameSession(
  gameId: string,
  workerUrl: string,
): UseGameSessionReturn {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  const [now, setNow] = useState(() => Date.now());
  const [leavingGame, setLeavingGame] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [remoteGameStatus, setRemoteGameStatus] =
    useState<RemoteGameStatus | null>(null);
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const r = await fetch("/api/game/token");
    if (!r.ok) throw new Error(`Token fetch: ${r.status}`);
    const d = (await r.json()) as { token?: string };
    if (!d.token) throw new Error("No token");
    return d.token;
  }, []);

  const {
    gameState,
    connectionStatus,
    lastError,
    activePrompt,
    gameOver,
    sendAction,
    leaveGame,
  } = useGameWs(gameId, workerUrl, getToken);

  /* ── Card DB ──────────────────────────────────────────────────────── */

  const [cardDb, setCardDb] = useState<CardDb>({});
  const cardDbFetched = useRef(false);
  useEffect(() => {
    if (cardDbFetched.current) return;
    cardDbFetched.current = true;
    getToken()
      .then((token) =>
        fetch(
          `${workerUrl}/game/${gameId}/cards?token=${encodeURIComponent(token)}`,
        ),
      )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CardDb | null) => {
        if (data) setCardDb(data);
      })
      .catch(() => {});
  }, [gameId, workerUrl, getToken]);

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

  /* ── Remote game status polling ───────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;

    const loadGameStatus = async () => {
      const response = await fetch(`/api/game/${gameId}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || cancelled) return;

      const data = (await response.json().catch(() => null)) as {
        game?: RemoteGameStatus;
      } | null;
      if (!cancelled && data?.game) {
        setRemoteGameStatus(data.game);
      }
    };

    void loadGameStatus();
    const interval = setInterval(() => {
      void loadGameStatus();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameId]);

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

  /* ── Finalize game in DB ──────────────────────────────────────────── */

  const finalizedRef = useRef(false);
  const finalizeGame = useCallback(async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const winnerId =
      gameOver?.winner != null && gameState
        ? gameState.players[gameOver.winner].playerId
        : null;

    await fetch(`/api/game/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "FINALIZE",
        winnerId,
        winReason: gameOver?.reason ?? "Game ended",
      }),
    }).catch(() => {});
  }, [gameId, gameOver, gameState]);

  useEffect(() => {
    if (matchClosed) void finalizeGame();
  }, [matchClosed, finalizeGame]);

  /* ── Navigation / leave handlers ──────────────────────────────────── */

  const handleBackToLobbies = useCallback(async () => {
    if (matchClosed) {
      await finalizeGame();
    } else {
      await leaveGame().catch(() => {});
    }
    window.location.href = "/lobbies";
  }, [matchClosed, finalizeGame, leaveGame]);

  const handleLeaveGame = useCallback(async () => {
    setLeavingGame(true);
    setLeaveError(null);
    try {
      await leaveGame();
      window.location.href = "/lobbies";
    } catch {
      setLeaveError("Failed to leave the game cleanly");
      setLeavingGame(false);
    }
  }, [leaveGame]);

  const handleFallbackConcede = useCallback(async () => {
    setFallbackSubmitting(true);
    setFallbackError(null);
    try {
      const response = await fetch(`/api/game/${gameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONCEDE" }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        game?: RemoteGameStatus;
      } | null;
      if (!response.ok || !data?.game) {
        throw new Error(data?.error ?? "Failed to concede");
      }

      setRemoteGameStatus(data.game);
      window.location.href = "/lobbies";
    } catch (error) {
      setFallbackError(
        error instanceof Error ? error.message : "Failed to concede",
      );
      setFallbackSubmitting(false);
    }
  }, [gameId]);

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
    gameState,
    cardDb,
    connectionStatus,
    lastError,
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

    opponentAway,
    opponentAwayText,
    gamePausedForOpponent,
    opponentDeadlineRemaining,

    remoteGameStatus,
    fallbackConcedeAvailable,
    fallbackSubmitting,
    fallbackError,
    handleFallbackConcede,

    leavingGame,
    leaveError,
    handleLeaveGame,
    handleBackToLobbies,

    endTitle,
    endColorClass,
    endReason,
  };
}
