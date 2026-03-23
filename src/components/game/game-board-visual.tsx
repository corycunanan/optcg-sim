"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameWs } from "@/hooks/use-game-ws";
import { cn } from "@/lib/utils";
import type { CardData, GameAction } from "@shared/game-types";
import { BoardLayout } from "./board-layout";

type CardDb = Record<string, CardData>;

interface GameBoardVisualProps {
  gameId: string;
  workerUrl: string;
}

export function GameBoardVisual({ gameId, workerUrl }: GameBoardVisualProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

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

  /* ── Derived values ─────────────────────────────────────────────── */

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
  const battlePhase = turn?.battleSubPhase ?? null;
  const stateFinished =
    gameState?.status === "FINISHED" || gameState?.status === "ABANDONED";
  const matchClosed = Boolean(gameOver || stateFinished);

  /* ── Finalize game in DB ────────────────────────────────────────── */

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

  /* ── Navigation ─────────────────────────────────────────────────── */

  const handleLeave = useCallback(async () => {
    if (matchClosed) {
      await finalizeGame();
    } else {
      await leaveGame().catch(() => {});
    }
    window.location.href = "/lobbies";
  }, [matchClosed, finalizeGame, leaveGame]);

  /* ── Render: loading state ──────────────────────────────────────── */

  if (!gameState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gb-board">
        <div className="text-center">
          <div className="text-sm text-gb-text-bright font-bold mb-2">
            {connectionStatus === "connecting"
              ? "Connecting\u2026"
              : "Waiting for game state\u2026"}
          </div>
          {lastError && (
            <div className="text-xs text-gb-accent-red">{lastError}</div>
          )}
          <button
            onClick={handleLeave}
            className="mt-4 px-3 py-1 text-xs text-gb-text-subtle border border-gb-border-strong rounded-md hover:text-gb-text-bright transition-colors cursor-pointer"
          >
            &larr; Back to Lobbies
          </button>
        </div>
      </div>
    );
  }

  /* ── Render: game ended overlay ─────────────────────────────────── */

  const endTitle = gameOver
    ? gameOver.winner === null
      ? "DRAW"
      : gameOver.winner === myIndex
        ? "VICTORY"
        : "DEFEAT"
    : stateFinished
      ? "MATCH ENDED"
      : null;

  const endColorClass = gameOver
    ? gameOver.winner === myIndex
      ? "text-gb-accent-green"
      : gameOver.winner === null
        ? "text-gb-accent-amber"
        : "text-gb-accent-red"
    : "text-gb-accent-amber";

  return (
    <>
      <BoardLayout
        me={me}
        opp={opp}
        myIndex={myIndex}
        turn={turn}
        cardDb={cardDb}
        isMyTurn={isMyTurn}
        battlePhase={battlePhase}
        connectionStatus={connectionStatus}
        activePrompt={activePrompt}
        onAction={sendAction as (a: GameAction) => void}
        onLeave={handleLeave}
        matchClosed={matchClosed}
      />

      {matchClosed && endTitle && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-end-title"
        >
          <div className="max-w-[400px] w-full bg-gb-surface border border-gb-border-strong rounded-lg p-6 text-center mx-4">
            <p
              id="match-end-title"
              className="text-xs font-semibold text-gb-text-subtle tracking-widest mb-2"
            >
              MATCH COMPLETE
            </p>
            <p className={cn("text-3xl font-extrabold mb-3", endColorClass)}>
              {endTitle}
            </p>
            <p className="text-sm text-gb-text leading-relaxed mb-6">
              {gameOver?.reason ?? "The game has ended."}
            </p>
            <button
              type="button"
              onClick={handleLeave}
              className="w-full py-3 px-4 rounded-md border-none bg-navy-800 text-gb-text-bright text-base font-bold cursor-pointer hover:bg-navy-700 transition-colors"
            >
              Back to Lobbies
            </button>
          </div>
        </div>
      )}
    </>
  );
}
