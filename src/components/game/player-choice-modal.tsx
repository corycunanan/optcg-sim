"use client";

import React from "react";
import type { GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";

interface PlayerChoiceModalProps {
  effectDescription: string;
  choices: { id: string; label: string }[];
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function PlayerChoiceModal({
  effectDescription,
  choices,
  isHidden,
  onHide,
  onAction,
}: PlayerChoiceModalProps) {
  if (isHidden) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-gb-surface border border-gb-border-strong rounded-lg flex flex-col"
        style={{ width: 400, maxWidth: "calc(100vw - 32px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gb-border">
          <span className="text-sm font-bold text-gb-text-bright">
            {effectDescription}
          </span>
          <button
            onClick={onHide}
            className="text-xs text-gb-text-dim hover:text-gb-text px-2 py-1 rounded-md hover:bg-gb-surface-raised transition-colors cursor-pointer"
          >
            Hide
          </button>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-2 px-4 py-4">
          {choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() =>
                onAction({ type: "PLAYER_CHOICE", choiceId: choice.id })
              }
              className={cn(
                "w-full px-4 py-3 text-sm text-left font-medium rounded-md border transition-colors cursor-pointer",
                "bg-gb-surface-raised text-gb-text border-gb-border-strong",
                "hover:border-gb-text-muted hover:text-gb-text-bright",
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
