"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GameState } from "@shared/game-types";
import type { RemoteGameStatus } from "./use-remote-game-status";

export interface UseGameFinalizerArgs {
  gameId: string;
  gameState: GameState | null;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  matchClosed: boolean;
  leaveGame: () => Promise<void>;
  setRemoteGameStatus: Dispatch<SetStateAction<RemoteGameStatus | null>>;
}

export interface UseGameFinalizerReturn {
  leavingGame: boolean;
  leaveError: string | null;
  fallbackSubmitting: boolean;
  fallbackError: string | null;
  handleBackToLobbies: () => Promise<void>;
  handleLeaveGame: () => Promise<void>;
  handleFallbackConcede: () => Promise<void>;
}

export function useGameFinalizer({
  gameId,
  gameState,
  gameOver,
  matchClosed,
  leaveGame,
  setRemoteGameStatus,
}: UseGameFinalizerArgs): UseGameFinalizerReturn {
  const [leavingGame, setLeavingGame] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [fallbackSubmitting, setFallbackSubmitting] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

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
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        data?: RemoteGameStatus;
      } | null;
      if (!response.ok || !json?.data) {
        throw new Error(json?.error ?? "Failed to concede");
      }

      setRemoteGameStatus(json.data);
      window.location.href = "/lobbies";
    } catch (error) {
      setFallbackError(
        error instanceof Error ? error.message : "Failed to concede",
      );
      setFallbackSubmitting(false);
    }
  }, [gameId, setRemoteGameStatus]);

  return {
    leavingGame,
    leaveError,
    fallbackSubmitting,
    fallbackError,
    handleBackToLobbies,
    handleLeaveGame,
    handleFallbackConcede,
  };
}
