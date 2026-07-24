"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GameState } from "@shared/game-types";
import type { RemoteGameStatus } from "./use-remote-game-status";
import { apiPost } from "@/lib/api-client";
import { ConcedeGameResponseSchema } from "@/lib/validators/game";

const FINALIZE_MAX_ATTEMPTS = 3;
const FINALIZE_RETRY_DELAY_MS = 250;

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

  const finalizeSucceededRef = useRef(false);
  const finalizeInFlightRef = useRef<Promise<boolean> | null>(null);
  const finalizeGame = useCallback(async (): Promise<boolean> => {
    if (finalizeSucceededRef.current) return true;
    if (finalizeInFlightRef.current) return finalizeInFlightRef.current;

    const winnerId =
      gameOver?.winner != null && gameState
        ? gameState.players[gameOver.winner].playerId
        : null;

    const request = (async () => {
      for (let attempt = 1; attempt <= FINALIZE_MAX_ATTEMPTS; attempt += 1) {
        try {
          await apiPost(`/api/game/${gameId}`, {
            action: "FINALIZE",
            winnerId,
            winReason: gameOver?.reason ?? "Game ended",
          });
          finalizeSucceededRef.current = true;
          return true;
        } catch {
          if (attempt < FINALIZE_MAX_ATTEMPTS) {
            await waitForFinalizeRetry();
          }
        }
      }
      return false;
    })();

    finalizeInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (finalizeInFlightRef.current === request) {
        finalizeInFlightRef.current = null;
      }
    }
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
      const json = await apiPost(
        `/api/game/${gameId}`,
        { action: "CONCEDE" },
        ConcedeGameResponseSchema
      );

      setRemoteGameStatus((current) =>
        current ? { ...current, ...json.data } : current
      );
      window.location.href = "/lobbies";
    } catch (error) {
      setFallbackError(
        error instanceof Error ? error.message : "Failed to concede"
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

function waitForFinalizeRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, FINALIZE_RETRY_DELAY_MS));
}
