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
  turnNumber,
  phase,
  battlePhase,
  canEndPhase,
  canPass,
  matchClosed,
  activePrompt,
  onAction,
}: {
  top: number;
  isMyTurn: boolean;
  turnNumber: number | undefined;
  phase: string;
  battlePhase: string | null;
  canEndPhase: boolean;
  canPass: boolean;
  matchClosed: boolean;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
  onAction: (action: GameAction) => void;
}) {
  const inBattle = !!battlePhase;

  return (
    <div
      className="absolute flex items-center justify-between px-4 bg-gb-board-dark"
      style={{
        left: 0,
        top,
        width: FIELD_W,
        height: MID_ZONE_H,
      }}
    >
      {/* Left: turn info */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            isMyTurn ? "bg-gb-accent-green" : "bg-gb-accent-amber",
          )}
        />
        <span className="text-xs text-gb-text-bright font-bold">
          T{turnNumber ?? "—"}
        </span>
        <span className="text-xs text-gb-accent-blue font-bold">
          {phase}
        </span>
        {battlePhase && (
          <span className="text-xs text-gb-accent-purple font-bold">
            &rsaquo; {battlePhase.replace(/_/g, " ")}
          </span>
        )}
        <span
          className={cn(
            "text-xs font-bold",
            isMyTurn ? "text-gb-accent-green" : "text-gb-text-dim",
          )}
        >
          {isMyTurn ? "YOUR TURN" : "OPP TURN"}
        </span>
      </div>

      {/* Center: active prompt */}
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

      {!activePrompt && <div className="flex-1" />}

      {/* Right: phase actions */}
      <div className="flex items-center gap-2 shrink-0">
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
        {!matchClosed && (
          <MidZoneBtn
            danger
            onClick={() => onAction({ type: "CONCEDE" })}
          >
            Concede
          </MidZoneBtn>
        )}
      </div>
    </div>
  );
});
