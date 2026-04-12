"use client";

import type { GameAction } from "@shared/game-types";
import { GameButton } from "./game-button";

export interface RedistributeTransfer {
  fromCardInstanceId: string;
  donInstanceId: string;
  toCardInstanceId: string;
}

interface RedistributeDonOverlayProps {
  effectDescription: string;
  maxTransfers: number;
  transfers: RedistributeTransfer[];
  onUndo: () => void;
  onAction: (action: GameAction) => void;
}

export function RedistributeDonOverlay({
  effectDescription,
  maxTransfers,
  transfers,
  onUndo,
  onAction,
}: RedistributeDonOverlayProps) {
  const remaining = Math.max(0, maxTransfers - transfers.length);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center pb-6">
      <div
        className="pointer-events-auto flex items-center gap-4 rounded-lg border border-gb-border-strong bg-gb-surface/95 px-4 py-3 shadow-lg backdrop-blur"
      >
        <div className="flex flex-col gap-1 max-w-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-gb-text-subtle">
            Redistribute DON
          </span>
          <span className="text-sm text-gb-text leading-snug">
            {effectDescription || "Drag DON from your cards to redistribute."}
          </span>
          <span className="text-xs text-gb-text-dim">
            {transfers.length} moved · {remaining} remaining
          </span>
        </div>

        <div className="flex items-center gap-2">
          <GameButton
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={transfers.length === 0}
          >
            Undo
          </GameButton>
          <GameButton
            variant="secondary"
            size="sm"
            onClick={() => onAction({ type: "REDISTRIBUTE_DON", transfers: [] })}
          >
            Skip
          </GameButton>
          <GameButton
            variant="primary"
            size="sm"
            onClick={() => onAction({ type: "REDISTRIBUTE_DON", transfers })}
            disabled={transfers.length === 0}
          >
            Confirm
          </GameButton>
        </div>
      </div>
    </div>
  );
}
