"use client";

import { cn } from "@/lib/utils";
import { NAVBAR_H } from "./constants";
import type { InteractionMode } from "./interaction-mode";
import { NavMenu } from "./nav-menu";

export interface BoardNavbarProps {
  turnNumber: number | null;
  isMyTurn: boolean;
  phaseLabel: string;
  interactionMode: InteractionMode;
  playerIndex: 0 | 1 | null;
  connectionStatus: string;
  onLeave: () => void;
  onConcede: () => void;
  matchClosed: boolean;
}

export function getBoardStatusAnnouncement({
  turnNumber,
  isMyTurn,
  phaseLabel,
  interactionMode,
}: Pick<
  BoardNavbarProps,
  "turnNumber" | "isMyTurn" | "phaseLabel" | "interactionMode"
>): string {
  return [
    turnNumber === null ? "Turn unavailable" : `Turn ${turnNumber}`,
    interactionMode === "spectator"
      ? "Watching"
      : isMyTurn
        ? "Your turn"
        : "Opponent's turn",
    phaseLabel,
  ]
    .filter(Boolean)
    .join(". ");
}

export function BoardNavbar({
  turnNumber,
  isMyTurn,
  phaseLabel,
  interactionMode,
  playerIndex,
  connectionStatus,
  onLeave,
  onConcede,
  matchClosed,
}: BoardNavbarProps) {
  const statusDot =
    connectionStatus === "connected"
      ? "bg-gb-accent-green"
      : connectionStatus === "connecting"
        ? "bg-gb-accent-amber"
        : "bg-gb-accent-red";
  const turnLabel =
    interactionMode === "spectator"
      ? "Watching"
      : isMyTurn
        ? "Your Turn"
        : "Opponent\u2019s Turn";
  const announcement = getBoardStatusAnnouncement({
    turnNumber,
    isMyTurn,
    phaseLabel,
    interactionMode,
  });

  return (
    <nav
      aria-label="Game board status and controls"
      className="bg-gb-navbar absolute inset-x-0 top-0 z-30 flex items-center px-4"
      style={{ height: NAVBAR_H }}
    >
      <span className="text-gb-text-bright shrink-0 text-xs font-bold tracking-widest">
        OPTCG SIM
      </span>

      <div
        className="flex flex-1 items-center justify-center gap-2"
        role="group"
        aria-label="Turn and phase status"
      >
        <span className="text-gb-text-bright text-xs font-bold">
          <span className="sr-only">
            {turnNumber === null ? "Turn unavailable" : `Turn ${turnNumber}`}
          </span>
          <span aria-hidden="true">Turn {turnNumber ?? "\u2014"}</span>
        </span>
        <div
          aria-hidden="true"
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            isMyTurn ? "bg-gb-accent-green" : "bg-gb-accent-amber"
          )}
        />
        <span
          className={cn(
            "text-xs font-bold",
            isMyTurn ? "text-gb-accent-green" : "text-gb-text-dim"
          )}
        >
          <span className="sr-only">{turnLabel}</span>
          <span aria-hidden="true">{turnLabel}</span>
        </span>
        <span className="text-gb-accent-blue text-xs font-bold">
          <span className="sr-only">Current phase: {phaseLabel}</span>
          <span aria-hidden="true">{phaseLabel}</span>
        </span>
      </div>

      <div
        className="flex shrink-0 items-center gap-3"
        role="group"
        aria-label="Player and connection status"
      >
        {interactionMode === "spectator" && (
          <span
            data-testid="board-spectator-badge"
            role="note"
            aria-label="Spectator mode: watching"
            className="bg-gb-accent-amber/20 text-gb-accent-amber border-gb-accent-amber/40 rounded border px-2 py-1 text-xs font-bold tracking-widest uppercase"
          >
            Watching
          </span>
        )}
        {interactionMode === "responseOnly" && (
          <span
            data-testid="board-respond-badge"
            role="note"
            aria-label="Response mode: respond to the current prompt"
            className="bg-gb-accent-blue/20 text-gb-accent-blue border-gb-accent-blue/40 rounded border px-2 py-1 text-xs font-bold tracking-widest uppercase"
          >
            Respond
          </span>
        )}
        {playerIndex !== null && (
          <span className="text-gb-text-dim text-xs">
            <span className="sr-only">You are Player {playerIndex + 1}</span>
            <span aria-hidden="true">P{playerIndex + 1}</span>
          </span>
        )}
        <div
          className="flex items-center gap-1"
          role="status"
          aria-label={`Connection status: ${connectionStatus}`}
        >
          <div
            aria-hidden="true"
            className={cn("h-2 w-2 rounded-full", statusDot)}
          />
          <span className="text-gb-text-dim text-xs">{connectionStatus}</span>
        </div>
        <NavMenu
          onLeave={onLeave}
          onConcede={interactionMode === "full" ? onConcede : undefined}
          matchClosed={matchClosed}
        />
      </div>

      <p
        data-testid="board-status-announcement"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
    </nav>
  );
}
