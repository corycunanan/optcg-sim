"use client";

import type { ReactNode } from "react";
import type {
  GameState,
  PendingPromptState,
  PromptOptions,
} from "@shared/game-types";
import { cn } from "@/lib/utils";

interface GameOverlayGateProps {
  viewerRole: "player" | "spectator";
  pregame: GameState["pregame"];
  pendingPrompt: PendingPromptState | null;
  promptRespondingPlayer: 0 | 1 | null;
  playerDisplayNames: readonly [string, string];
  children: ReactNode;
}

/**
 * Single shell-level policy boundary for game overlays. Interactive overlays
 * are player-only; spectators always take the passive branch.
 */
export function GameOverlayGate({
  viewerRole,
  pregame,
  pendingPrompt,
  promptRespondingPlayer,
  playerDisplayNames,
  children,
}: GameOverlayGateProps) {
  if (viewerRole === "spectator") {
    if (pregame) {
      return (
        <SpectatorPregameOverlay
          pregame={pregame}
          respondingPlayer={
            promptRespondingPlayer ?? pendingPrompt?.respondingPlayer ?? null
          }
          playerDisplayNames={playerDisplayNames}
        />
      );
    }

    if (pendingPrompt) {
      return (
        <SpectatorPromptStatus
          prompt={pendingPrompt.options}
          respondingPlayer={
            promptRespondingPlayer ?? pendingPrompt.respondingPlayer
          }
          playerDisplayNames={playerDisplayNames}
        />
      );
    }

    return null;
  }

  return children;
}

function SpectatorPromptStatus({
  prompt,
  respondingPlayer,
  playerDisplayNames,
}: {
  prompt: PromptOptions;
  respondingPlayer: 0 | 1;
  playerDisplayNames: readonly [string, string];
}) {
  const timedDecision =
    "timeoutMs" in prompt &&
    typeof prompt.timeoutMs === "number" &&
    prompt.timeoutMs > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[65] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="border-gb-accent-amber/30 bg-gb-prompt-bg text-gb-text-bright flex flex-col items-center gap-1 rounded-lg border px-5 py-3 text-sm shadow-lg"
      >
        <span className="font-semibold">
          {playerDisplayNames[respondingPlayer]} is{" "}
          {describePromptDecision(prompt)}…
        </span>
        {timedDecision && (
          <span className="text-gb-text-dim text-xs">
            Timed decision in progress
          </span>
        )}
      </div>
    </div>
  );
}

function describePromptDecision(prompt: PromptOptions): string {
  switch (prompt.promptType) {
    case "SELECT_BLOCKER":
      return "choosing a blocker";
    case "SELECT_TARGET":
      return "choosing a target";
    case "ARRANGE_TOP_CARDS":
      return "arranging cards";
    case "PLAYER_CHOICE":
      return "making a choice";
    case "REDISTRIBUTE_DON":
      return "redistributing DON!!";
    case "OPTIONAL_EFFECT":
      return "deciding whether to activate an effect";
    case "REVEAL_TRIGGER":
      return "deciding whether to activate a trigger";
  }
}

function SpectatorPregameOverlay({
  pregame,
  respondingPlayer,
  playerDisplayNames,
}: {
  pregame: NonNullable<GameState["pregame"]>;
  respondingPlayer: 0 | 1 | null;
  playerDisplayNames: readonly [string, string];
}) {
  const [playerZeroName, playerOneName] = playerDisplayNames;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-gb-board/90 pointer-events-none fixed inset-0 z-[90] flex flex-col items-center justify-center gap-8 px-6 text-center backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-gb-text-bright text-3xl font-bold tracking-widest uppercase">
          {pregame.phase === "MULLIGAN_DECISIONS"
            ? "Opening hands"
            : "Preparing the game"}
        </h2>
        <p className="text-gb-text-dim max-w-xl text-sm">
          {describePregamePhase(pregame, respondingPlayer, playerDisplayNames)}
        </p>
      </div>

      {pregame.priorityRolls && (
        <div className="flex items-center gap-12" aria-label="Priority rolls">
          <PassiveRoll
            name={playerZeroName}
            value={pregame.priorityRolls[0]}
            won={pregame.priorityDeciderIndex === 0}
          />
          <span className="text-gb-text-subtle text-2xl font-bold">vs</span>
          <PassiveRoll
            name={playerOneName}
            value={pregame.priorityRolls[1]}
            won={pregame.priorityDeciderIndex === 1}
          />
        </div>
      )}

      {pregame.phase === "MULLIGAN_DECISIONS" && (
        <div className="border-gb-border-strong bg-gb-surface flex flex-col gap-3 rounded-lg border px-6 py-5 text-left">
          {playerDisplayNames.map((name, playerIndex) => (
            <div
              key={playerIndex}
              className="text-gb-text flex items-center justify-between gap-8 text-sm"
            >
              <span className="font-semibold">{name}</span>
              <span className="text-gb-text-dim">
                {describeMulliganDecision(
                  pregame.mulliganDecisions[playerIndex as 0 | 1],
                  respondingPlayer === playerIndex
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PassiveRoll({
  name,
  value,
  won,
}: {
  name: string;
  value: number;
  won: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "flex h-24 w-24 items-center justify-center rounded-lg border-2 text-5xl font-bold",
          won
            ? "border-gb-accent-amber bg-gb-prompt-bg text-gb-accent-amber shadow-lg"
            : "border-gb-border-strong bg-gb-surface text-gb-text"
        )}
      >
        {value}
      </div>
      <span className="text-gb-text-dim text-xs tracking-widest uppercase">
        {name}
      </span>
    </div>
  );
}

function describePregamePhase(
  pregame: NonNullable<GameState["pregame"]>,
  respondingPlayer: 0 | 1 | null,
  playerDisplayNames: readonly [string, string]
): string {
  switch (pregame.phase) {
    case "PRIORITY_ROLLING":
      return `${playerDisplayNames[0]} and ${playerDisplayNames[1]} are rolling for priority…`;
    case "PRIORITY_CHOICE":
      return pregame.priorityDeciderIndex === null
        ? "The priority roll is being resolved…"
        : `${playerDisplayNames[pregame.priorityDeciderIndex]} won the roll and is choosing who goes first…`;
    case "MULLIGAN_DECISIONS":
      return respondingPlayer === null
        ? "The players are deciding whether to keep their opening hands…"
        : `${playerDisplayNames[respondingPlayer]} is deciding whether to keep their opening hand…`;
    case "START_OF_GAME_FX":
      return pregame.firstPlayerIndex === null
        ? "Start-of-game effects are resolving…"
        : `${playerDisplayNames[pregame.firstPlayerIndex]} will go first. Start-of-game effects are resolving…`;
    case "HAND_DEAL":
      return "Opening hands are being dealt…";
    case "LIFE_PLACEMENT":
      return pregame.firstPlayerIndex === null
        ? "Life cards are being placed…"
        : `${playerDisplayNames[pregame.firstPlayerIndex]} will go first. Life cards are being placed…`;
    case "DONE":
      return pregame.firstPlayerIndex === null
        ? "The game is about to begin…"
        : `${playerDisplayNames[pregame.firstPlayerIndex]} will go first. The game is about to begin…`;
  }
}

function describeMulliganDecision(
  decision: boolean | null,
  isResponding: boolean
): string {
  if (decision === true) return "Redrew";
  if (decision === false) return "Kept";
  return isResponding ? "Deciding…" : "Waiting…";
}
