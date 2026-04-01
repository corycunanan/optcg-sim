"use client";

import { useState } from "react";
import { useGameSession } from "@/hooks/use-game-session";
import { cn } from "@/lib/utils";
import { BoardLayout } from "./board-layout/index";
import { GameErrorBoundary } from "./game-error-boundary";
import { EventLog } from "./event-log";
import { formatCountdown } from "./game-ui";
import type { PromptOptions, PromptType } from "@shared/game-types";

interface GameBoardVisualProps {
  gameId: string;
  workerUrl: string;
}

export function GameBoardVisual({ gameId, workerUrl }: GameBoardVisualProps) {
  const session = useGameSession(gameId, workerUrl);
  const [devPrompt, setDevPrompt] = useState<{ promptType: PromptType; options: PromptOptions } | null>(null);
  const activePrompt = devPrompt ?? session.activePrompt;

  if (!session.gameState || !session.cardDbReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gb-board">
        <div className="text-center">
          <div className="text-sm text-gb-text-bright font-bold mb-2">
            {session.connectionStatus === "connecting"
              ? "Connecting\u2026"
              : !session.gameState
                ? "Waiting for game state\u2026"
                : "Loading card data\u2026"}
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
    <GameErrorBoundary>
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
        activePrompt={activePrompt}
        onAction={(action) => {
          if (
            action.type === "ARRANGE_TOP_CARDS" ||
            action.type === "PLAYER_CHOICE" ||
            action.type === "REVEAL_TRIGGER" ||
            action.type === "PASS"
          ) setDevPrompt(null);
          session.sendAction(action);
        }}
        onLeave={session.handleBackToLobbies}
        matchClosed={session.matchClosed}
      />

      {/* ── Dev: modal test panel ── only in development ──────────────── */}
      {process.env.NODE_ENV === "development" && session.me && (
        <div className="fixed bottom-4 right-4 z-[300] flex items-center gap-2">
          {devPrompt && (
            <button
              onClick={() => setDevPrompt(null)}
              className="px-2 py-1 text-xs font-mono bg-gb-surface-raised border border-gb-accent-red/30 text-gb-accent-red rounded cursor-pointer"
            >
              clear
            </button>
          )}
          <select
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value;
              e.target.value = "";
              if (!val || !session.me) return;
              if (val === "ARRANGE_TOP_CARDS") {
                const cards = session.me.deck.slice(0, 4);
                if (cards.length === 0) return;
                setDevPrompt({
                  promptType: "ARRANGE_TOP_CARDS",
                  options: {
                    cards,
                    effectDescription: "Look at the top 4 cards of your deck",
                    canSendToBottom: true,
                  },
                });
              } else if (val === "PLAYER_CHOICE") {
                setDevPrompt({
                  promptType: "PLAYER_CHOICE",
                  options: {
                    effectDescription: "Choose an effect",
                    choices: [
                      { id: "draw_2", label: "Draw 2 cards" },
                      { id: "give_don", label: "Give 1 DON!! to your Leader" },
                      { id: "return_char", label: "Return 1 opponent's Character to hand" },
                    ],
                  },
                });
              } else if (val === "SELECT_TARGET") {
                const allCards = [
                  ...session.me.characters.filter(Boolean),
                  ...(session.opp?.characters.filter(Boolean) ?? []),
                  ...session.me.hand.slice(0, 4),
                ] as typeof session.me.characters;
                if (allCards.length === 0) return;
                // Mark roughly half as valid targets
                const validTargets = allCards
                  .filter((_, i) => i % 2 === 0)
                  .map((c) => c.instanceId);
                setDevPrompt({
                  promptType: "SELECT_TARGET",
                  options: {
                    cards: allCards,
                    validTargets,
                    effectDescription: "Select up to 2 Characters with cost 3 or less",
                    countMin: 1,
                    countMax: 2,
                    ctaLabel: "Confirm Selection",
                  },
                });
              } else if (val === "OPTIONAL_EFFECT") {
                const card = session.me.hand[0] ?? session.me.characters.find(Boolean) ?? null;
                setDevPrompt({
                  promptType: "OPTIONAL_EFFECT",
                  options: {
                    effectDescription: "You may give 1 DON!! card to your Leader or 1 of your Characters.",
                    cards: card ? [card] : [],
                  },
                });
              } else if (val === "REVEAL_TRIGGER") {
                const triggerCard = session.me.deck.find(
                  (c) => session.cardDb[c.cardId]?.triggerText
                ) ?? session.me.deck[0] ?? null;
                if (!triggerCard) return;
                const triggerText = session.cardDb[triggerCard.cardId]?.triggerText ?? "[Trigger] Play this card.";
                setDevPrompt({
                  promptType: "REVEAL_TRIGGER",
                  options: {
                    cards: [triggerCard],
                    effectDescription: triggerText,
                  },
                });
              }
            }}
            className="px-2 py-1 text-xs font-mono bg-gb-surface-raised border border-gb-border-strong text-gb-text-dim rounded cursor-pointer"
          >
            <option value="" disabled>[dev] test modal…</option>
            <option value="ARRANGE_TOP_CARDS">Arrange Top Cards</option>
            <option value="SELECT_TARGET">Select Target</option>
            <option value="PLAYER_CHOICE">Player Choice</option>
            <option value="OPTIONAL_EFFECT">Optional Effect</option>
            <option value="REVEAL_TRIGGER">Reveal Trigger</option>
          </select>
        </div>
      )}

      {/* Event Log — bottom left */}
      <EventLog
        events={session.gameState.eventLog}
        cardDb={session.cardDb}
        myIndex={session.myIndex}
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
    </GameErrorBoundary>
  );
}
