"use client";

import { useSession } from "next-auth/react";
import { ApiError, apiGet } from "@/lib/api-client";
import { GameTokenResponseSchema } from "@/lib/validators/game";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWs } from "@/hooks/use-game-ws";
import type { AcceptedGameUpdate, ActionRejection } from "@/hooks/use-game-ws";
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
  actionRejection: ActionRejection | null;
  acceptedUpdate: AcceptedGameUpdate | null;
  activePrompt: PromptOptions | null;
  activePromptId: string | null;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  sendAction: (action: GameAction) => void;
  viewerRole: GameSessionViewerRole;
  myIndex: 0 | 1 | null;
  me: PlayerState | null;
  opp: PlayerState | null;
  bottomPlayerIndex: 0 | 1;
  bottomPlayer: PlayerState | null;
  topPlayer: PlayerState | null;
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
  remoteGameNotFound: boolean;
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

export type GameSessionViewerRole = "player" | "spectator";

export type GameSessionPerspective =
  | {
      viewerRole?: "player";
      requestedPlayerIndex?: 0 | 1;
    }
  | {
      viewerRole: "spectator";
      bottomPlayerIndex?: 0 | 1;
    };

/**
 * Composes the client-side game session for one player perspective.
 *
 * Solitaire may mount this hook twice for the same `gameId`, but only when
 * each instance has a distinct `requestedPlayerIndex` (`0` and `1`). Each
 * instance owns an independent WebSocket, token fetch, send debounce, and
 * opponent-presence ticker. Finalization is single-owner at this layer: the
 * normal PVP instance and the Solitaire player-0 instance can finalize, while
 * the Solitaire player-1 instance exposes inert navigation handlers so
 * `POST /api/game/{id}` only fires once per closed match.
 *
 * Card database loading and remote-status polling intentionally remain
 * per-instance here. Consumers that mount both Solitaire perspectives should
 * de-duplicate those reads in the composite layer introduced by OPT-301.
 */
export function useGameSession(
  gameId: string,
  workerUrl: string,
  perspective: GameSessionPerspective = {}
) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const viewerRole = perspective.viewerRole ?? "player";
  const requestedPlayerIndex =
    perspective.viewerRole === "spectator"
      ? undefined
      : perspective.requestedPlayerIndex;

  /* ── Remote game status polling ───────────────────────────────────── */

  const { remoteGameStatus, remoteGameNotFound, setRemoteGameStatus } =
    useRemoteGameStatus(gameId);
  const liveGameId = remoteGameNotFound ? "" : gameId;

  const getToken = useCallback(async () => {
    if (remoteGameNotFound) {
      throw new Error("Game not found");
    }
    const params = new URLSearchParams({ gameId: liveGameId });
    if (requestedPlayerIndex !== undefined) {
      params.set("playerIndex", String(requestedPlayerIndex));
    }
    try {
      const response = await apiGet(
        `/api/game/token?${params.toString()}`,
        GameTokenResponseSchema
      );
      return response.data.token;
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(`Token fetch: ${error.status}`);
      }
      throw new Error("No token");
    }
  }, [liveGameId, remoteGameNotFound, requestedPlayerIndex]);

  /* ── WebSocket ────────────────────────────────────────────────────── */

  const {
    gameState,
    connectionStatus,
    lastError,
    actionRejection,
    acceptedUpdate,
    activePrompt,
    activePromptId,
    gameOver,
    canUndo,
    sendAction: rawSendAction,
    leaveGame,
    retryConnection,
  } = useGameWs(liveGameId, workerUrl, getToken);

  // Suppress duplicate identical actions fired within a short window. Rapid
  // clicks (or double-trigger from keyboard + click) can otherwise send the
  // same action twice before the server responds, causing desync.
  const lastSendRef = useRef<{ signature: string; at: number } | null>(null);
  const sendAction = useCallback(
    (action: GameAction) => {
      if (viewerRole === "spectator") {
        console.warn("[game-session] Ignored spectator action", action);
        return;
      }
      const signature = JSON.stringify(action);
      const now = Date.now();
      const last = lastSendRef.current;
      if (last && last.signature === signature && now - last.at < 250) {
        return;
      }
      lastSendRef.current = { signature, at: now };
      rawSendAction(action);
    },
    [rawSendAction, viewerRole]
  );

  /* ── Card DB ──────────────────────────────────────────────────────── */

  const { cardDb, cardDbReady, cardDbError, retryFetchCards } = useCardDatabase(
    liveGameId,
    workerUrl,
    getToken
  );

  // Single retry entry point for the UI. Re-runs whichever subsystem is
  // currently broken; each call is idempotent.
  const retryConnectivity = useCallback(() => {
    if (cardDbError) retryFetchCards();
    retryConnection();
  }, [cardDbError, retryFetchCards, retryConnection]);

  /* ── Player derivation ────────────────────────────────────────────── */

  const isSameUserSolitairePerspective = Boolean(
    gameState &&
    requestedPlayerIndex !== undefined &&
    gameState.players[0].playerId === userId &&
    gameState.players[1].playerId === userId
  );
  const matchedPlayerIndex =
    gameState?.players[0].playerId === userId
      ? 0
      : gameState?.players[1].playerId === userId
        ? 1
        : null;
  const explicitPlayerIndex = isSameUserSolitairePerspective
    ? (requestedPlayerIndex ?? null)
    : null;
  const myIndex =
    viewerRole === "player" && gameState
      ? (explicitPlayerIndex ?? matchedPlayerIndex)
      : null;
  const oppIndex: 0 | 1 | null =
    viewerRole === "player" && myIndex !== null
      ? myIndex === 0
        ? 1
        : 0
      : null;
  const me =
    viewerRole === "player" && myIndex !== null && gameState
      ? gameState.players[myIndex]
      : null;
  const opp =
    viewerRole === "player" && oppIndex !== null && gameState
      ? gameState.players[oppIndex]
      : null;
  const bottomPlayerIndex: 0 | 1 =
    perspective.viewerRole === "spectator"
      ? (perspective.bottomPlayerIndex ?? 0)
      : (myIndex ?? requestedPlayerIndex ?? 0);
  const topPlayerIndex: 0 | 1 = bottomPlayerIndex === 0 ? 1 : 0;
  const bottomPlayer = gameState?.players[bottomPlayerIndex] ?? null;
  const topPlayer = gameState?.players[topPlayerIndex] ?? null;
  const turn = gameState?.turn ?? null;
  const isMyTurn =
    viewerRole === "player" && myIndex !== null && turn
      ? turn.activePlayerIndex === myIndex
      : false;
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
        (player) => player.rejoinDeadlineAt !== null && !player.connected
      )
    ) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  /* ── Match closed ─────────────────────────────────────────────────── */

  const resolvedWithoutSocket = Boolean(
    !gameOver && remoteGameStatus && remoteGameStatus.status !== "IN_PROGRESS"
  );
  const stateFinished =
    gameState?.status === "FINISHED" || gameState?.status === "ABANDONED";
  const matchClosed = Boolean(
    gameOver || resolvedWithoutSocket || stateFinished
  );

  const fallbackConcedeAvailable =
    !gameState &&
    connectionStatus !== "connecting" &&
    remoteGameStatus?.status === "IN_PROGRESS" &&
    !!remoteGameStatus.canFallbackConcede;

  /* ── Finalize / leave handlers ────────────────────────────────────── */

  const finalizerEnabled =
    viewerRole === "player" &&
    (requestedPlayerIndex === undefined || requestedPlayerIndex === 0);
  const noopNavigationHandler = useCallback(async () => {}, []);
  const handleSpectatorBackToLobbies = useCallback(async () => {
    window.location.href = "/lobbies";
  }, []);

  const finalizerNavigation = useGameFinalizer({
    gameId,
    gameState,
    gameOver,
    matchClosed: finalizerEnabled && matchClosed,
    leaveGame,
    setRemoteGameStatus,
  });
  const {
    leavingGame,
    leaveError,
    fallbackSubmitting,
    fallbackError,
    handleBackToLobbies,
    handleLeaveGame,
    handleFallbackConcede,
  } = finalizerEnabled
    ? finalizerNavigation
    : viewerRole === "spectator"
      ? {
          leavingGame: false,
          leaveError: null,
          fallbackSubmitting: false,
          fallbackError: null,
          handleBackToLobbies: handleSpectatorBackToLobbies,
          handleLeaveGame: handleSpectatorBackToLobbies,
          handleFallbackConcede: noopNavigationHandler,
        }
      : {
          leavingGame: false,
          leaveError: null,
          fallbackSubmitting: false,
          fallbackError: null,
          handleBackToLobbies: noopNavigationHandler,
          handleLeaveGame: noopNavigationHandler,
          handleFallbackConcede: noopNavigationHandler,
        };

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
    gameOver?.reason ?? remoteGameStatus?.winReason ?? "The game has ended.";

  return {
    game: {
      gameState,
      cardDb,
      cardDbReady,
      connectionStatus,
      lastError: lastError ?? cardDbError,
      actionRejection,
      acceptedUpdate,
      activePrompt,
      activePromptId,
      gameOver,
      sendAction,
      viewerRole,
      myIndex,
      me,
      opp,
      bottomPlayerIndex,
      bottomPlayer,
      topPlayer,
      turn,
      isMyTurn,
      phase,
      battlePhase,
      inBattle,
      matchClosed,
      canUndo,
      retryConnection: retryConnectivity,
      connectivityFailed: connectionStatus === "failed" || cardDbError !== null,
    },
    opponent: {
      opponentAway,
      opponentAwayText,
      gamePausedForOpponent,
      opponentDeadlineRemaining,
    },
    navigation: {
      remoteGameStatus,
      remoteGameNotFound,
      fallbackConcedeAvailable: finalizerEnabled && fallbackConcedeAvailable,
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
