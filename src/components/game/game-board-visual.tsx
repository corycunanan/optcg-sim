"use client";

import { useGameSession } from "@/hooks/use-game-session";
import { cn } from "@/lib/utils";
import { BoardLayout } from "./board-layout/index";
import { formatCountdown } from "./game-ui";

interface GameBoardVisualProps {
  gameId: string;
  workerUrl: string;
}

export function GameBoardVisual({ gameId, workerUrl }: GameBoardVisualProps) {
  const session = useGameSession(gameId, workerUrl);

  if (!session.gameState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gb-board">
        <div className="text-center">
          <div className="text-sm text-gb-text-bright font-bold mb-2">
            {session.connectionStatus === "connecting"
              ? "Connecting\u2026"
              : "Waiting for game state\u2026"}
          </div>
          {session.lastError && (
            <div className="text-xs text-gb-accent-red">
              {session.lastError}
            </div>
          )}
          {session.fallbackConcedeAvailable && (
            <div className="mt-4 flex flex-col gap-3 items-center">
              <div className="text-gb-text-subtle text-xs max-w-[420px]">
                Reconnect failed. You can still concede this match without
                restoring the websocket session.
              </div>
              {session.fallbackError && (
                <div className="text-gb-accent-red text-xs">
                  {session.fallbackError}
                </div>
              )}
              <button
                onClick={session.handleFallbackConcede}
                disabled={session.fallbackSubmitting}
                className="px-2 py-1 bg-gb-surface-raised border border-gb-accent-red/30 text-gb-accent-red cursor-pointer rounded text-xs font-mono hover:border-gb-accent-red/50"
              >
                {session.fallbackSubmitting
                  ? "Conceding\u2026"
                  : "Concede Match"}
              </button>
            </div>
          )}
          <button
            onClick={session.handleBackToLobbies}
            className="mt-4 px-3 py-1 text-xs text-gb-text-subtle border border-gb-border-strong rounded-md hover:text-gb-text-bright transition-colors cursor-pointer"
          >
            &larr; Back to Lobbies
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Opponent away / disconnect banner */}
      {!session.matchClosed && session.opponentAway && (
        <div
          className={cn(
            "fixed inset-x-0 top-0 z-[60] flex gap-3 items-center px-4 py-2 flex-wrap",
            session.gamePausedForOpponent
              ? "bg-gb-prompt-bg border-b border-gb-accent-amber/25"
              : "bg-gb-surface border-b border-gb-border-strong",
          )}
        >
          <span
            className={cn(
              "font-bold text-sm",
              session.gamePausedForOpponent
                ? "text-gb-accent-amber"
                : "text-gb-accent-blue",
            )}
          >
            {session.gamePausedForOpponent ? "GAME PAUSED" : "OPPONENT AWAY"}
          </span>
          <span className="text-gb-text-dim text-xs">
            {session.opponentAwayText}{" "}
            {session.gamePausedForOpponent
              ? "The game will resume once they reconnect."
              : "You can keep making moves until their input is required."}
          </span>
          {session.opponentDeadlineRemaining !== null && (
            <span className="text-gb-accent-amber text-xs">
              Rejoin window:{" "}
              {formatCountdown(session.opponentDeadlineRemaining)}
            </span>
          )}
        </div>
      )}

      <BoardLayout
        me={session.me}
        opp={session.opp}
        myIndex={session.myIndex}
        turn={session.turn}
        cardDb={session.cardDb}
        isMyTurn={session.isMyTurn}
        battlePhase={session.battlePhase}
        connectionStatus={session.connectionStatus}
        activePrompt={session.activePrompt}
        onAction={session.sendAction}
        onLeave={session.handleBackToLobbies}
        matchClosed={session.matchClosed}
      />

      {/* Match ended overlay */}
      {session.matchClosed && (
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
            <p
              className={cn(
                "text-3xl font-extrabold mb-3",
                session.endColorClass,
              )}
            >
              {session.endTitle}
            </p>
            <p className="text-sm text-gb-text leading-relaxed mb-6">
              {session.endReason}
            </p>
            <button
              type="button"
              onClick={session.handleBackToLobbies}
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
