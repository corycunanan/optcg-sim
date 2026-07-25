"use client";

import { useCallback, useMemo, useState } from "react";
import { useGameSession } from "@/hooks/use-game-session";
import type { GameAction, GameState } from "@shared/game-types";

export type SolitairePerspective = 0 | 1;

export interface SolitaireSessionPerspective {
  myIndex: SolitairePerspective;
  flipPerspective: () => void;
  activeTurnIndex: SolitairePerspective | null;
  promptedIndex: SolitairePerspective | null;
}

export interface SolitaireSessionSides {
  0: ReturnType<typeof useGameSession>;
  1: ReturnType<typeof useGameSession>;
}

const getPromptedIndex = (
  player0State: GameState | null,
  player1State: GameState | null,
  player0HasPrompt: boolean,
  player1HasPrompt: boolean
): SolitairePerspective | null => {
  const pendingPrompt =
    player0State?.pendingPrompt ?? player1State?.pendingPrompt ?? null;
  if (pendingPrompt) return pendingPrompt.respondingPlayer;

  if (player0HasPrompt && !player1HasPrompt) return 0;
  if (player1HasPrompt && !player0HasPrompt) return 1;
  return null;
};

const getActiveTurnIndex = (
  player0State: GameState | null,
  player1State: GameState | null
): SolitairePerspective | null =>
  player0State?.turn.activePlayerIndex ??
  player1State?.turn.activePlayerIndex ??
  null;

export function useSolitaireSession(gameId: string, workerUrl: string) {
  const player0 = useGameSession(gameId, workerUrl, {
    requestedPlayerIndex: 0,
  });
  const player1 = useGameSession(gameId, workerUrl, {
    requestedPlayerIndex: 1,
  });

  const player0State = player0.game.gameState;
  const player1State = player1.game.gameState;
  const promptedIndex = getPromptedIndex(
    player0State,
    player1State,
    player0.game.activePrompt !== null,
    player1.game.activePrompt !== null
  );
  const activeTurnIndex = getActiveTurnIndex(player0State, player1State);
  const autoPerspective = promptedIndex ?? activeTurnIndex ?? 0;
  const autoPerspectiveKey =
    promptedIndex !== null
      ? `prompt:${promptedIndex}`
      : activeTurnIndex !== null
        ? `turn:${activeTurnIndex}`
        : "fallback:0";

  const [manualPerspective, setManualPerspective] = useState<{
    index: SolitairePerspective;
    autoKey: string;
  } | null>(null);
  const myIndex =
    manualPerspective?.autoKey === autoPerspectiveKey
      ? manualPerspective.index
      : autoPerspective;

  const flipPerspective = useCallback(() => {
    setManualPerspective({
      index: myIndex === 0 ? 1 : 0,
      autoKey: autoPerspectiveKey,
    });
  }, [autoPerspectiveKey, myIndex]);

  const sides = useMemo<SolitaireSessionSides>(
    () => ({ 0: player0, 1: player1 }),
    [player0, player1]
  );
  const current = sides[myIndex];

  const sendAction = useCallback(
    (action: GameAction) => {
      sides[myIndex].game.sendAction(action);
    },
    [myIndex, sides]
  );

  return {
    ...current,
    game: {
      ...current.game,
      myIndex,
      sendAction,
    },
    perspective: {
      myIndex,
      flipPerspective,
      activeTurnIndex,
      promptedIndex,
    },
    sides,
  };
}
