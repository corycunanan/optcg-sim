"use client";

// Live game shell. Mirrors `<SandboxShell>`'s contract: composes the shared
// scaled-board primitives and renders live-only chrome (opponent-away banner,
// EventLog, dev modal-test panel, match-end Dialog, connectivity/loading
// states) as siblings of `<ScaledBoard>`, outside the scaled subtree.
//
// Per the OPT-321 shell contract, this shell may inject only `state` and
// `dispatch` into `<Board>` and MUST NOT customize anything inside it.

import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useGameSession } from "@/hooks/use-game-session";
import { useSolitaireSession } from "@/hooks/use-solitaire-session";
import { cn } from "@/lib/utils";
import {
  Board,
  type BoardState,
  type BoardDispatch,
} from "@/components/game/board";
import {
  MinViewportGate,
  PortalRoot,
  ScaledBoard,
} from "@/components/game/scaled-board";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { GameButton } from "./game-button";
import { GameErrorBoundary } from "./game-error-boundary";
import { EventLog } from "./event-log";
import { formatCountdown } from "./game-ui";
import { PregameOverlay } from "./pregame/pregame-overlay";
import type { PromptOptions } from "@shared/game-types";
import type { SolitairePerspective } from "@/hooks/use-solitaire-session";

export interface LiveGameShellProps {
  gameId: string;
  workerUrl: string;
  playerIndex?: 0 | 1;
  gameMode?: "PVP" | "SOLITAIRE" | "PVCOMPUTER";
}

export function LiveGameShell(props: LiveGameShellProps) {
  // Gate at the wrapper level so `useGameSession` (which opens a websocket)
  // doesn't run for users below the 1280×640 desktop floor.
  return (
    <MinViewportGate>
      <LiveGameShellContent {...props} />
    </MinViewportGate>
  );
}

function LiveGameShellContent({
  gameId,
  workerUrl,
  playerIndex,
  gameMode,
}: LiveGameShellProps) {
  if (gameMode === "SOLITAIRE") {
    return <SolitaireGameSession gameId={gameId} workerUrl={workerUrl} />;
  }

  return (
    <PvpGameSession
      gameId={gameId}
      workerUrl={workerUrl}
      playerIndex={playerIndex}
    />
  );
}

function PvpGameSession(props: LiveGameShellProps) {
  const session = useGameSession(
    props.gameId,
    props.workerUrl,
    props.playerIndex
  );

  return <GameSessionView session={session} />;
}

function SolitaireGameSession({
  gameId,
  workerUrl,
}: Pick<LiveGameShellProps, "gameId" | "workerUrl">) {
  const session = useSolitaireSession(gameId, workerUrl);

  return (
    <GameSessionView
      session={session}
      solitaire={{
        myIndex: session.perspective.myIndex,
        activeTurnIndex: session.perspective.activeTurnIndex,
        promptedIndex: session.perspective.promptedIndex,
        onFlipPerspective: session.perspective.flipPerspective,
      }}
    />
  );
}

type GameSessionReturn = ReturnType<typeof useGameSession>;

interface GameSessionViewProps {
  session: GameSessionReturn;
  solitaire?: {
    myIndex: SolitairePerspective;
    activeTurnIndex: SolitairePerspective | null;
    promptedIndex: SolitairePerspective | null;
    onFlipPerspective: () => void;
  };
}

function GameSessionView({ session, solitaire }: GameSessionViewProps) {
  const { game, opponent, navigation, endState } = session;
  const [devPrompt, setDevPrompt] = useState<PromptOptions | null>(null);
  const [fadeVisible, setFadeVisible] = useState(false);
  const [turnBanner, setTurnBanner] = useState<string | null>(null);
  const previousPerspectiveRef = useRef<SolitairePerspective | null>(
    solitaire?.myIndex ?? null
  );
  const manualFlipPendingRef = useRef(false);
  const fadeTimersRef = useRef<number[]>([]);
  const activePrompt = devPrompt ?? game.activePrompt;
  const activePromptId = devPrompt ? null : game.activePromptId;

  const clearFadeTimers = useCallback(() => {
    fadeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    fadeTimersRef.current = [];
  }, []);

  const runFade = useCallback(
    (onCovered?: () => void) => {
      clearFadeTimers();

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        onCovered?.();
        setFadeVisible(false);
        return;
      }

      setFadeVisible(true);
      fadeTimersRef.current = [
        window.setTimeout(() => {
          onCovered?.();
        }, 120),
        window.setTimeout(() => {
          setFadeVisible(false);
        }, 340),
      ];
    },
    [clearFadeTimers]
  );

  useEffect(() => {
    return clearFadeTimers;
  }, [clearFadeTimers]);

  useEffect(() => {
    if (!solitaire) return;

    const previousPerspective = previousPerspectiveRef.current;
    if (
      previousPerspective !== null &&
      previousPerspective !== solitaire.myIndex
    ) {
      if (manualFlipPendingRef.current) {
        manualFlipPendingRef.current = false;
      } else {
        const timer = window.setTimeout(() => {
          runFade();
          if (
            solitaire.promptedIndex === null &&
            solitaire.activeTurnIndex === solitaire.myIndex
          ) {
            setTurnBanner(`Side ${solitaire.myIndex + 1}'s turn`);
            const bannerTimer = window.setTimeout(
              () => setTurnBanner(null),
              2200
            );
            fadeTimersRef.current.push(bannerTimer);
          }
        }, 0);
        fadeTimersRef.current.push(timer);
      }
    }
    previousPerspectiveRef.current = solitaire.myIndex;
  }, [runFade, solitaire]);

  const handleFlipPerspective = () => {
    if (!solitaire) return;
    manualFlipPendingRef.current = true;
    runFade(solitaire.onFlipPerspective);
  };

  if (navigation.remoteGameNotFound) {
    return (
      <MissingGameState onBackToLobbies={navigation.handleBackToLobbies} />
    );
  }

  if (!game.gameState || !game.cardDbReady) {
    if (game.connectivityFailed) {
      return (
        <div className="bg-gb-board flex h-full w-full items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="text-gb-text-bright text-lg font-bold">
              Can&rsquo;t reach the game server
            </div>
            <div className="text-gb-text text-sm leading-relaxed">
              Your browser couldn&rsquo;t establish a connection after several
              attempts. This usually means something on your network is blocking
              the connection.
            </div>
            <ul className="text-gb-text-subtle list-inside list-disc text-left text-xs leading-relaxed">
              <li>Try a different network (mobile hotspot works well)</li>
              <li>Disable VPN, antivirus HTTPS scanning, or ad-blockers</li>
              <li>Check that your device clock is correct</li>
              <li>Try another browser or an incognito window</li>
            </ul>
            {game.lastError && (
              <div className="text-gb-accent-red text-xs">{game.lastError}</div>
            )}
            <div className="mt-2 flex gap-3">
              <GameButton
                variant="primary"
                size="sm"
                onClick={game.retryConnection}
              >
                Retry
              </GameButton>
              <GameButton
                variant="ghost"
                size="sm"
                onClick={navigation.handleBackToLobbies}
              >
                &larr; Back to Lobbies
              </GameButton>
            </div>
            {navigation.fallbackConcedeAvailable && (
              <div className="mt-2 flex flex-col items-center gap-2">
                <div className="text-gb-text-subtle text-xs">
                  You can also concede this match without reconnecting.
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
                    ? "Conceding…"
                    : "Concede Match"}
                </GameButton>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <LoadingGameState
        label={
          game.connectionStatus === "connecting"
            ? "Connecting…"
            : !game.gameState
              ? "Loading game…"
              : "Loading card data…"
        }
      >
        {game.lastError && (
          <div className="text-gb-accent-red text-xs">{game.lastError}</div>
        )}
        {navigation.fallbackConcedeAvailable && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="text-gb-text-subtle max-w-[420px] text-xs">
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
              {navigation.fallbackSubmitting ? "Conceding…" : "Concede Match"}
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
      </LoadingGameState>
    );
  }

  const state: BoardState = {
    me: game.me,
    opp: game.opp,
    myIndex: game.myIndex,
    turn: game.turn,
    cardDb: game.cardDb,
    isMyTurn: game.isMyTurn,
    battlePhase: game.battlePhase,
    connectionStatus: game.connectionStatus,
    eventLog: game.gameState.eventLog,
    activeEffects: game.gameState.activeEffects,
    effectAvailability: game.gameState.effectAvailability,
    activePrompt,
    activePromptId,
    matchClosed: game.matchClosed,
    canUndo: game.canUndo,
    actionRejection: game.actionRejection,
    acceptedUpdate: game.acceptedUpdate,
    promptRespondingPlayer:
      game.gameState.promptRespondingPlayer ??
      game.gameState.pendingPrompt?.respondingPlayer ??
      (activePrompt ? game.myIndex : null),
  };

  const dispatch: BoardDispatch = {
    onAction: (action) => {
      if (
        action.type === "ARRANGE_TOP_CARDS" ||
        action.type === "PLAYER_CHOICE" ||
        action.type === "REVEAL_TRIGGER" ||
        action.type === "PASS"
      ) {
        setDevPrompt(null);
      }
      game.sendAction(action);
    },
    onLeave: () => {
      void navigation.handleBackToLobbies();
    },
  };

  return (
    <GameErrorBoundary>
      <PortalRoot />

      {solitaire && (
        <div className="border-gb-border-strong bg-gb-surface fixed top-4 left-4 z-[70] flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg">
          <div className="flex flex-col gap-1">
            <span className="text-gb-accent-amber text-xs font-bold tracking-widest uppercase">
              Solitaire
            </span>
            <span className="text-gb-text-bright text-sm font-semibold">
              Side {solitaire.myIndex + 1}
              {solitaire.promptedIndex === solitaire.myIndex
                ? " response"
                : solitaire.activeTurnIndex === solitaire.myIndex
                  ? " turn"
                  : " view"}
            </span>
          </div>
          <GameButton
            variant="ghost"
            size="sm"
            onClick={handleFlipPerspective}
            className="gap-2"
          >
            <RotateCw className="size-4" aria-hidden />
            Flip Perspective
          </GameButton>
        </div>
      )}

      {turnBanner && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-[65] flex justify-center">
          <div className="border-gb-accent-amber/30 bg-gb-prompt-bg text-gb-accent-amber rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg">
            {turnBanner}
          </div>
        </div>
      )}

      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 z-[90] bg-black transition-opacity duration-200 motion-reduce:transition-none",
          fadeVisible ? "opacity-100" : "opacity-0"
        )}
      />

      {!game.matchClosed && opponent.opponentAway && (
        <div
          className={cn(
            "fixed inset-x-0 top-0 z-[60] flex min-h-12 flex-wrap items-center gap-3 px-4 py-2",
            opponent.gamePausedForOpponent
              ? "bg-gb-prompt-bg border-gb-accent-amber/25 border-b"
              : "bg-gb-surface border-gb-border-strong border-b"
          )}
        >
          <span
            className={cn(
              "text-sm font-bold",
              opponent.gamePausedForOpponent
                ? "text-gb-accent-amber"
                : "text-gb-accent-blue"
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

      <ScaledBoard designWidth={1920} designHeight={1080}>
        <Board state={state} dispatch={dispatch} />
      </ScaledBoard>

      {game.gameState.pregame && (
        <PregameOverlay
          pregame={game.gameState.pregame}
          myIndex={game.myIndex}
          myHand={game.me?.hand ?? []}
          cardDb={game.cardDb}
          activePrompt={activePrompt}
          promptRespondingPlayer={
            game.gameState.pendingPrompt?.respondingPlayer ?? (activePrompt ? game.myIndex : null)
          }
          onAction={dispatch.onAction}
        />
      )}

      {process.env.NODE_ENV === "development" && game.me && (
        <div className="fixed right-4 bottom-4 z-[300] flex items-center gap-2">
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
                  cards,
                  effectDescription: "Look at the top 4 cards of your deck",
                  canSendToBottom: true,
                });
              } else if (val === "PLAYER_CHOICE") {
                setDevPrompt({
                  promptType: "PLAYER_CHOICE",
                  effectDescription: "Choose an effect",
                  choices: [
                    { id: "draw_2", label: "Draw 2 cards" },
                    { id: "give_don", label: "Give 1 DON!! to your Leader" },
                    {
                      id: "return_char",
                      label: "Return 1 opponent's Character to hand",
                    },
                  ],
                });
              } else if (val === "SELECT_TARGET") {
                const allCards = [
                  ...game.me.characters.filter(
                    (c): c is NonNullable<typeof c> => c !== null
                  ),
                  ...(game.opp?.characters.filter(
                    (c): c is NonNullable<typeof c> => c !== null
                  ) ?? []),
                  ...game.me.hand.slice(0, 4),
                ];
                if (allCards.length === 0) return;
                const validTargets = allCards
                  .filter((_, i) => i % 2 === 0)
                  .map((c) => c.instanceId);
                setDevPrompt({
                  promptType: "SELECT_TARGET",
                  cards: allCards,
                  validTargets,
                  effectDescription:
                    "Select up to 2 Characters with cost 3 or less",
                  countMin: 1,
                  countMax: 2,
                  ctaLabel: "Confirm Selection",
                });
              } else if (val === "OPTIONAL_EFFECT") {
                const card =
                  game.me.hand[0] ?? game.me.characters.find(Boolean) ?? null;
                setDevPrompt({
                  promptType: "OPTIONAL_EFFECT",
                  effectDescription:
                    "You may give 1 DON!! card to your Leader or 1 of your Characters.",
                  cards: card ? [card] : [],
                });
              } else if (val === "REVEAL_TRIGGER") {
                const triggerCard =
                  game.me.deck.find(
                    (c) => game.cardDb[c.cardId]?.triggerText
                  ) ??
                  game.me.deck[0] ??
                  null;
                if (!triggerCard) return;
                const triggerText =
                  game.cardDb[triggerCard.cardId]?.triggerText ??
                  "[Trigger] Play this card.";
                setDevPrompt({
                  promptType: "REVEAL_TRIGGER",
                  cards: [triggerCard],
                  effectDescription: triggerText,
                  optional: false,
                  timeoutMs: 30_000,
                });
              }
            }}
            className="bg-gb-surface-raised border-gb-border-strong text-gb-text-dim cursor-pointer rounded border px-2 py-1 font-mono text-xs"
          >
            <option value="" disabled>
              [dev] test modal…
            </option>
            <option value="ARRANGE_TOP_CARDS">Arrange Top Cards</option>
            <option value="SELECT_TARGET">Select Target</option>
            <option value="PLAYER_CHOICE">Player Choice</option>
            <option value="OPTIONAL_EFFECT">Optional Effect</option>
            <option value="REVEAL_TRIGGER">Reveal Trigger</option>
          </select>
        </div>
      )}

      <EventLog
        events={game.gameState.eventLog}
        cardDb={game.cardDb}
        myIndex={game.myIndex}
      />

      <Dialog open={game.matchClosed}>
        <DialogContent
          showCloseButton={false}
          className="bg-gb-surface border-gb-border-strong text-gb-text text-center sm:max-w-[400px]"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="items-center">
            <DialogTitle className="text-gb-text-subtle text-xs font-semibold tracking-widest">
              MATCH COMPLETE
            </DialogTitle>
          </DialogHeader>
          <p className={cn("text-3xl font-extrabold", endState.endColorClass)}>
            {endState.endTitle}
          </p>
          <p className="text-gb-text text-sm leading-relaxed">
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

function LoadingGameState({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-gb-board flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="text-gb-text-bright size-6" />
        <div className="text-gb-text-bright text-sm font-bold">{label}</div>
        {children}
      </div>
    </div>
  );
}

function MissingGameState({
  onBackToLobbies,
}: {
  onBackToLobbies: () => void | Promise<void>;
}) {
  return (
    <div className="bg-gb-board flex h-full w-full items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="text-gb-text-bright text-lg font-bold">
          Game not found
        </div>
        <div className="text-gb-text text-sm leading-relaxed">
          This game is no longer available. It may have been cleaned up after a
          failed local start attempt.
        </div>
        <GameButton
          variant="primary"
          size="sm"
          onClick={() => {
            void onBackToLobbies();
          }}
        >
          Back to Lobbies
        </GameButton>
      </div>
    </div>
  );
}
