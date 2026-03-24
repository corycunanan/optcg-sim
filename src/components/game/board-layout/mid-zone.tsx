"use client";

import React from "react";
import type { GameAction, PromptOptions, PromptType } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { FIELD_W, MID_ZONE_H } from "./constants";

export interface BattleInfo {
  attackerName: string;
  attackerPower: number;
  defenderName: string;
  defenderPower: number;
  counterPowerAdded: number;
  battleSubPhase: string;
}

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

function formatPower(power: number): string {
  return power >= 1000 ? `${(power / 1000).toFixed(0)}K` : String(power);
}

const BattleDisplay = React.memo(function BattleDisplay({
  info,
}: {
  info: BattleInfo;
}) {
  const boosted = info.counterPowerAdded > 0;

  return (
    <div className="flex items-center gap-3 shrink-0">
      <span
        className={cn(
          "text-xs uppercase tracking-wider font-bold",
          info.battleSubPhase === "COUNTER_STEP"
            ? "text-gb-accent-red"
            : info.battleSubPhase === "BLOCK_STEP"
              ? "text-gb-accent-amber"
              : "text-gb-text-dim",
        )}
      >
        {info.battleSubPhase.replace(/_/g, " ")}
      </span>

      <div className="flex items-center gap-1">
        <span className="text-xs text-gb-text-subtle truncate max-w-[80px]">
          {info.attackerName}
        </span>
        <span className="text-xs font-bold text-gb-text-bright tabular-nums">
          {formatPower(info.attackerPower)}
        </span>
      </div>

      <span className="text-xs font-bold text-gb-text-dim">VS</span>

      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-xs font-bold tabular-nums",
            boosted ? "text-gb-accent-green" : "text-gb-text-bright",
          )}
        >
          {formatPower(info.defenderPower)}
        </span>
        {boosted && (
          <span className="text-xs font-bold text-gb-accent-green/70 tabular-nums">
            +{formatPower(info.counterPowerAdded)}
          </span>
        )}
        <span className="text-xs text-gb-text-subtle truncate max-w-[80px]">
          {info.defenderName}
        </span>
      </div>
    </div>
  );
});

export interface BlockerMode {
  selectedBlockerId: string | null;
  onBlock: () => void;
}

function MidZoneDisabledBtn({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1 text-xs font-bold rounded border border-gb-border-strong/50 text-gb-text-dim/50 select-none">
      {children}
    </span>
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
  battleInfo,
  blockerMode,
  onAction,
}: {
  top: number;
  isMyTurn: boolean;
  phase: string;
  canEndPhase: boolean;
  canPass: boolean;
  inBattle: boolean;
  activePrompt: { promptType: PromptType; options: PromptOptions } | null;
  battleInfo: BattleInfo | null;
  blockerMode?: BlockerMode;
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
      {/* Battle display */}
      {battleInfo && <BattleDisplay info={battleInfo} />}

      {/* Active prompt (suppressed when blockerMode handles the UI) */}
      {activePrompt && !blockerMode && (
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

      {/* Blocker selection: Block + Skip */}
      {blockerMode ? (
        <>
          {blockerMode.selectedBlockerId ? (
            <MidZoneBtn accent onClick={blockerMode.onBlock}>
              Block
            </MidZoneBtn>
          ) : (
            <MidZoneDisabledBtn>Block</MidZoneDisabledBtn>
          )}
          <MidZoneBtn onClick={() => onAction({ type: "PASS" })}>
            Skip
          </MidZoneBtn>
        </>
      ) : (
        canPass && (
          <MidZoneBtn onClick={() => onAction({ type: "PASS" })}>
            Pass
          </MidZoneBtn>
        )
      )}

      {!isMyTurn && !inBattle && (
        <span className="text-xs text-gb-text-dim italic">
          Waiting&hellip;
        </span>
      )}
    </div>
  );
});
