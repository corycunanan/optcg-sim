"use client";

import React from "react";
import type { GameAction, PromptOptions, PromptType } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { FIELD_W, MID_ZONE_H } from "./constants";

function MidZoneBtn({
  children,
  onClick,
  accent,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-xs font-bold rounded cursor-pointer border transition-colors duration-100",
        accent
          ? "bg-gb-accent-green/15 text-gb-accent-green border-gb-accent-green/30 hover:border-gb-accent-green/50"
          : danger
            ? "text-gb-accent-red border-transparent hover:border-gb-accent-red/30"
            : "bg-gb-surface-raised text-gb-text border-gb-border-strong hover:border-gb-text-muted",
      )}
    >
      {children}
    </button>
  );
}

export const MidZone = React.memo(function MidZone({
  top,
  isMyTurn,
  phase,
  canEndPhase,
  canPass,
  inBattle,
  activePrompt,
  onAction,
}: {
  top: number;
  isMyTurn: boolean;
  phase: string;
  canEndPhase: boolean;
  canPass: boolean;
  inBattle: boolean;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
  onAction: (action: GameAction) => void;
}) {
  return (
    <div
      className="absolute flex items-center justify-center px-4 gap-2"
      style={{
        left: 0,
        top,
        width: FIELD_W,
        height: MID_ZONE_H,
      }}
    >
      {/* Active prompt */}
      {activePrompt && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gb-accent-amber font-bold">
            &#x26A1; {activePrompt.promptType.replace(/_/g, " ")}
          </span>
          {activePrompt.promptType === "REVEAL_TRIGGER" && (
            <>
              <MidZoneBtn
                onClick={() =>
                  onAction({ type: "REVEAL_TRIGGER", reveal: true })
                }
              >
                Reveal
              </MidZoneBtn>
              <MidZoneBtn
                onClick={() =>
                  onAction({ type: "REVEAL_TRIGGER", reveal: false })
                }
              >
                Add to Hand
              </MidZoneBtn>
            </>
          )}
          {activePrompt.options.optional && (
            <MidZoneBtn onClick={() => onAction({ type: "PASS" })}>
              Skip
            </MidZoneBtn>
          )}
        </div>
      )}

      {/* Phase actions */}
      {canEndPhase && (
        <MidZoneBtn
          accent
          onClick={() => onAction({ type: "ADVANCE_PHASE" })}
        >
          End {phase} &rarr;
        </MidZoneBtn>
      )}
      {canPass && (
        <MidZoneBtn onClick={() => onAction({ type: "PASS" })}>
          Pass
        </MidZoneBtn>
      )}
      {!isMyTurn && !inBattle && (
        <span className="text-xs text-gb-text-dim italic">
          Waiting&hellip;
        </span>
      )}
    </div>
  );
});
