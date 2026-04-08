"use client";

import { useState } from "react";
import { useGameSession } from "@/hooks/use-game-session";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { GameButton } from "./game-button";
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
  const { game, opponent, navigation, endState } = useGameSession(gameId, workerUrl);
  const [devPrompt, setDevPrompt] = useState<{ promptType: PromptType; options: PromptOptions } | null>(null);
  const activePrompt = devPrompt ?? game.activePrompt;

  if (!game.gameState || !game.cardDbReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gb-board">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-6 text-gb-text-bright" />
          <div className="text-sm text-gb-text-bright font-bold">
            {game.connectionStatus === "connecting"
              ? "Connecting\u2026"
              : !game.gameState
                ? "Loading game\u2026"
                : "Loading card data\u2026"}
          </div>
          {game.lastError && (
            <div className="text-xs text-gb-accent-red">
              {game.lastError}
            </div>
          )}
          {navigation.fallbackConcedeAvailable && (
            <div className="mt-4 flex flex-col gap-3 items-center">
              <div className="text-gb-text-subtle text-xs max-w-[420px]">
                Reconnect failed. You can still concede this match without
                restoring the websocket session.
              </div>
              {navigation.fallbackError && (
                <div className="text-gb-accent-red text-xs">
                  {navigation.fallbackError}
                </div>
              )}
              <GameButton
                variant="danger"
                size="sm"
                onClick={navigation.handleFallbackConcede}
                disabled={navigation.fallbackSubmitting}
                className="font-mono"
              >
                {navigation.fallbackSubmitting
                  ? "Conceding\u2026"
                  : "Concede Match"}
              </GameButton>
            </div>
          )}
          <GameButton
            variant="ghost"
            size="sm"
            onClick={navigation.handleBackToLobbies}
            className="mt-4"
          >
            &larr; Back to Lobbies
          </GameButton>
        </div>
      </div>
    );
  }

  return (
    <GameErrorBoundary>
      {/* Opponent away / disconnect banner */}
      {!game.matchClosed && opponent.opponentAway && (
        <div
          className={cn(
            "fixed inset-x-0 top-0 z-[60] flex gap-3 items-center px-4 py-2 flex-wrap",
            opponent.gamePausedForOpponent
              ? "bg-gb-prompt-bg border-b border-gb-accent-amber/25"
              : "bg-gb-surface border-b border-gb-border-strong",
          )}
        >
          <span
            className={cn(
              "font-bold text-sm",
              opponent.gamePausedForOpponent
                ? "text-gb-accent-amber"
                : "text-gb-accent-blue",
            )}
          >
            {opponent.gamePausedForOpponent ? "GAME PAUSED" : "OPPONENT AWAY"}
          </span>
          <span className="text-gb-text-dim text-xs">
            {opponent.opponentAwayText}{" "}
            {opponent.gamePausedForOpponent
              ? "The game will resume once they reconnect."
              : "You can keep making moves until their input is required."}
          </span>
          {opponent.opponentDeadlineRemaining !== null && (
            <span className="text-gb-accent-amber text-xs">
              Rejoin window:{" "}
              {formatCountdown(opponent.opponentDeadlineRemaining)}
            </span>
          )}
        </div>
      )}

      <BoardLayout
        me={game.me}
        opp={game.opp}
        myIndex={game.myIndex}
        turn={game.turn}
        cardDb={game.cardDb}
        isMyTurn={game.isMyTurn}
        battlePhase={game.battlePhase}
        connectionStatus={game.connectionStatus}
        eventLog={game.gameState.eventLog}
        activeEffects={game.gameState.activeEffects}
        activePrompt={activePrompt}
        onAction={(action) => {
          if (
            action.type === "ARRANGE_TOP_CARDS" ||
            action.type === "PLAYER_CHOICE" ||
            action.type === "REVEAL_TRIGGER" ||
            action.type === "PASS"
          ) setDevPrompt(null);
          game.sendAction(action);
        }}
        onLeave={navigation.handleBackToLobbies}
        matchClosed={game.matchClosed}
        canUndo={game.canUndo}
      />

      {/* ── Dev: modal test panel ── only in development ──────────────── */}
      {process.env.NODE_ENV === "development" && game.me && (
        <div className="fixed bottom-4 right-4 z-[300] flex items-center gap-2">
          {devPrompt && (
            <GameButton
              variant="danger"
              size="sm"
              onClick={() => setDevPrompt(null)}
              className="font-mono"
            >
              clear
            </GameButton>
          )}
          <select
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value;
              e.target.value = "";
              if (!val || !game.me) return;
              if (val === "ARRANGE_TOP_CARDS") {
                const cards = game.me.deck.slice(0, 4);
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
                  ...game.me.characters.filter((c): c is NonNullable<typeof c> => c !== null),
                  ...(game.opp?.characters.filter((c): c is NonNullable<typeof c> => c !== null) ?? []),
                  ...game.me.hand.slice(0, 4),
                ];
                if (allCards.length === 0) return;
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
                const card = game.me.hand[0] ?? game.me.characters.find(Boolean) ?? null;
                setDevPrompt({
                  promptType: "OPTIONAL_EFFECT",
                  options: {
                    effectDescription: "You may give 1 DON!! card to your Leader or 1 of your Characters.",
                    cards: card ? [card] : [],
                  },
                });
              } else if (val === "REVEAL_TRIGGER") {
                const triggerCard = game.me.deck.find(
                  (c) => game.cardDb[c.cardId]?.triggerText
                ) ?? game.me.deck[0] ?? null;
                if (!triggerCard) return;
                const triggerText = game.cardDb[triggerCard.cardId]?.triggerText ?? "[Trigger] Play this card.";
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
        events={game.gameState.eventLog}
        cardDb={game.cardDb}
        myIndex={game.myIndex}
      />

      {/* Match ended overlay */}
      <Dialog open={game.matchClosed}>
        <DialogContent
          showCloseButton={false}
          className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[400px] text-center"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="items-center">
            <DialogTitle className="text-xs font-semibold text-gb-text-subtle tracking-widest">
              MATCH COMPLETE
            </DialogTitle>
          </DialogHeader>
          <p
            className={cn(
              "text-3xl font-extrabold",
              endState.endColorClass,
            )}
          >
            {endState.endTitle}
          </p>
          <p className="text-sm text-gb-text leading-relaxed">
            {endState.endReason}
          </p>
          <GameButton
            variant="primary"
            size="lg"
            onClick={navigation.handleBackToLobbies}
            className="w-full"
          >
            Back to Lobbies
          </GameButton>
        </DialogContent>
      </Dialog>
    </GameErrorBoundary>
  );
}
