"use client";

import React from "react";
import type { GameAction, PromptOptions, PromptType } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { FIELD_W, MID_ZONE_H } from "./constants";
import { GameButton } from "../game-button";
import { Spinner } from "@/components/ui/spinner";

export interface BattleInfo {
  attackerName: string;
  attackerPower: number;
  defenderName: string;
  defenderPower: number;
  counterPowerAdded: number;
  battleSubPhase: string;
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
    <GameButton variant="secondary" size="sm" disabled>
      {children}
    </GameButton>
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
  isPromptHidden,
  onShowPrompt,
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
  isPromptHidden?: boolean;
  onShowPrompt?: () => void;
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

      {/* Hidden modal prompt indicator */}
      {activePrompt && isPromptHidden && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gb-accent-amber font-bold">
            &#x26A1; ACTION REQUIRED
          </span>
          <GameButton variant="green" size="sm" onClick={onShowPrompt ?? (() => {})}>
            Show Prompt
          </GameButton>
        </div>
      )}

      {/* Active prompt (suppressed when blockerMode or modal handles the UI) */}
      {activePrompt && !blockerMode && !isPromptHidden && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gb-accent-amber font-bold">
            &#x26A1; {activePrompt.promptType.replace(/_/g, " ")}
          </span>
          {activePrompt.promptType === "REVEAL_TRIGGER" &&
            !activePrompt.options.cards?.length && (
            <>
              <GameButton
                variant="secondary"
                size="sm"
                onClick={() =>
                  onAction({ type: "REVEAL_TRIGGER", reveal: true })
                }
              >
                Reveal
              </GameButton>
              <GameButton
                variant="secondary"
                size="sm"
                onClick={() =>
                  onAction({ type: "REVEAL_TRIGGER", reveal: false })
                }
              >
                Add to Hand
              </GameButton>
            </>
          )}
          {activePrompt.options.optional &&
            activePrompt.promptType !== "OPTIONAL_EFFECT" && (
            <GameButton variant="secondary" size="sm" onClick={() => onAction({ type: "PASS" })}>
              Skip
            </GameButton>
          )}
        </div>
      )}

      {/* Phase actions */}
      {canEndPhase && (
        <GameButton
          variant="green"
          size="sm"
          onClick={() => onAction({ type: "ADVANCE_PHASE" })}
        >
          End {phase} &rarr;
        </GameButton>
      )}

      {/* Blocker selection: Block + Skip */}
      {blockerMode ? (
        <>
          {blockerMode.selectedBlockerId ? (
            <GameButton variant="green" size="sm" onClick={blockerMode.onBlock}>
              Block
            </GameButton>
          ) : (
            <MidZoneDisabledBtn>Block</MidZoneDisabledBtn>
          )}
          <GameButton variant="secondary" size="sm" onClick={() => onAction({ type: "PASS" })}>
            Skip
          </GameButton>
        </>
      ) : (
        canPass && (
          <GameButton variant="secondary" size="sm" onClick={() => onAction({ type: "PASS" })}>
            Pass
          </GameButton>
        )
      )}

      {!isMyTurn && !inBattle && (
        <Spinner className="size-4 text-gb-text-dim" />
      )}
    </div>
  );
});
