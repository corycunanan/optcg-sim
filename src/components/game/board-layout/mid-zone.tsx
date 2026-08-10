"use client";

import React from "react";
import type { GameAction, PromptOptions } from "@shared/game-types";
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

/** Inside-scaled-subtree override for the shared `GameButton` primitive
 *  (OPT-346). Lifts the button text to the in-board `text-base` floor and the
 *  focus ring to `ring-4` so both stay legible at the 1280×640 floor scale.
 *  Chrome consumers (modals) keep the primitive's `text-xs`/`ring-2`. */
const IN_BOARD_BTN = "text-base focus-visible:ring-4";

const BattleDisplay = React.memo(function BattleDisplay({
  info,
}: {
  info: BattleInfo;
}) {
  const boosted = info.counterPowerAdded > 0;

  return (
    <div className="flex shrink-0 items-center gap-3">
      <span
        className={cn(
          "text-base font-semibold tracking-wider uppercase",
          info.battleSubPhase === "COUNTER_STEP"
            ? "text-gb-accent-red"
            : info.battleSubPhase === "BLOCK_STEP"
              ? "text-gb-accent-amber"
              : "text-gb-text-dim"
        )}
      >
        {info.battleSubPhase.replace(/_/g, " ")}
      </span>

      <div className="flex items-center gap-1">
        <span className="text-gb-text-subtle max-w-[80px] truncate text-base">
          {info.attackerName}
        </span>
        <span className="text-gb-text-bright text-base font-semibold tabular-nums">
          {formatPower(info.attackerPower)}
        </span>
      </div>

      <span className="text-gb-text-dim text-base font-semibold">VS</span>

      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-base font-semibold tabular-nums",
            boosted ? "text-gb-accent-green" : "text-gb-text-bright"
          )}
        >
          {formatPower(info.defenderPower)}
        </span>
        {boosted && (
          <span className="text-gb-accent-green/70 text-base font-semibold tabular-nums">
            +{formatPower(info.counterPowerAdded)}
          </span>
        )}
        <span className="text-gb-text-subtle max-w-[80px] truncate text-base">
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

export interface TargetSelectionMode {
  effectDescription: string;
  countLabel: string;
  selectedCount: number;
  aggregateLabel: string | null;
  ctaLabel: string;
  canConfirm: boolean;
  canSkip: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}

export function getPromptAnnouncement(
  activePrompt: PromptOptions | null,
  blockerMode?: BlockerMode,
  targetSelectionMode?: TargetSelectionMode,
  isPromptHidden?: boolean
): string {
  if (targetSelectionMode) {
    return `Action required. ${targetSelectionMode.effectDescription || "Choose targets"}. ${targetSelectionMode.selectedCount} selected.`;
  }
  if (blockerMode) {
    return blockerMode.selectedBlockerId
      ? "Action required. Blocker selected. Confirm block or skip."
      : "Action required. Choose a blocker or skip.";
  }
  if (!activePrompt) return "";

  const promptName = activePrompt.promptType.replace(/_/g, " ").toLowerCase();
  return isPromptHidden
    ? `Action required. ${promptName} prompt hidden. Show the prompt to respond.`
    : `Action required. ${promptName}.`;
}

function MidZoneDisabledBtn({ children }: { children: React.ReactNode }) {
  return (
    <GameButton variant="secondary" size="sm" disabled className={IN_BOARD_BTN}>
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
  rejectionReason,
  battleInfo,
  blockerMode,
  targetSelectionMode,
  isPromptHidden,
  onShowPrompt,
  canUndo,
  onAction,
}: {
  top: number;
  isMyTurn: boolean;
  phase: string;
  canEndPhase: boolean;
  canPass: boolean;
  inBattle: boolean;
  activePrompt: PromptOptions | null;
  rejectionReason: string | null;
  battleInfo: BattleInfo | null;
  blockerMode?: BlockerMode;
  targetSelectionMode?: TargetSelectionMode;
  isPromptHidden?: boolean;
  onShowPrompt?: () => void;
  canUndo?: boolean;
  onAction: (action: GameAction) => void;
}) {
  const promptAnnouncement = getPromptAnnouncement(
    activePrompt,
    blockerMode,
    targetSelectionMode,
    isPromptHidden
  );

  return (
    <div
      className="absolute flex items-center justify-center gap-2 px-4"
      style={{
        left: 0,
        top,
        width: FIELD_W,
        height: MID_ZONE_H,
      }}
    >
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {promptAnnouncement}
      </p>
      {rejectionReason && (
        <div
          role="status"
          aria-live="polite"
          className="flex min-w-0 items-center gap-2 text-base"
        >
          <span className="text-gb-accent-amber font-semibold" aria-hidden>
            &#x26A1;
          </span>
          <span className="text-gb-text-dim truncate">
            Not available &mdash; {rejectionReason}
          </span>
        </div>
      )}

      {/* Battle display */}
      {battleInfo && <BattleDisplay info={battleInfo} />}

      {/* Hidden modal prompt indicator */}
      {activePrompt && !targetSelectionMode && isPromptHidden && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-gb-accent-amber text-base font-semibold">
            &#x26A1; ACTION REQUIRED
          </span>
          <GameButton
            variant="green"
            size="sm"
            className={IN_BOARD_BTN}
            onClick={onShowPrompt ?? (() => {})}
          >
            Show Prompt
          </GameButton>
        </div>
      )}

      {/* Active prompt (suppressed when blockerMode or modal handles the UI) */}
      {activePrompt &&
        !blockerMode &&
        !targetSelectionMode &&
        !isPromptHidden && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-gb-accent-amber text-base font-semibold">
              &#x26A1; {activePrompt.promptType.replace(/_/g, " ")}
            </span>
            {activePrompt.promptType === "REVEAL_TRIGGER" &&
              !activePrompt.cards?.length && (
                <>
                  <GameButton
                    variant="secondary"
                    size="sm"
                    className={IN_BOARD_BTN}
                    onClick={() =>
                      onAction({ type: "REVEAL_TRIGGER", reveal: true })
                    }
                  >
                    Reveal
                  </GameButton>
                  <GameButton
                    variant="secondary"
                    size="sm"
                    className={IN_BOARD_BTN}
                    onClick={() =>
                      onAction({ type: "REVEAL_TRIGGER", reveal: false })
                    }
                  >
                    Add to Hand
                  </GameButton>
                </>
              )}
            {"optional" in activePrompt && activePrompt.optional && (
              <GameButton
                variant="secondary"
                size="sm"
                className={IN_BOARD_BTN}
                onClick={() => onAction({ type: "PASS" })}
              >
                Skip
              </GameButton>
            )}
          </div>
        )}

      {targetSelectionMode && (
        <div
          className="flex min-w-0 items-center gap-2"
          data-target-selection-control=""
        >
          <span
            className="text-gb-accent-amber shrink-0 text-base font-semibold"
            aria-hidden
          >
            &#x26A1;
          </span>
          <span className="text-gb-text-bright max-w-[320px] truncate text-base">
            {targetSelectionMode.effectDescription || "Choose targets"}
          </span>
          <span className="text-gb-text-dim shrink-0 text-base">
            {targetSelectionMode.countLabel} &mdash;{" "}
            {targetSelectionMode.selectedCount} selected
          </span>
          {targetSelectionMode.aggregateLabel && (
            <span className="text-gb-text-subtle shrink-0 text-base">
              &middot; {targetSelectionMode.aggregateLabel}
            </span>
          )}
          <GameButton
            variant={targetSelectionMode.canConfirm ? "green" : "secondary"}
            size="sm"
            className={IN_BOARD_BTN}
            disabled={!targetSelectionMode.canConfirm}
            onClick={targetSelectionMode.onConfirm}
          >
            {targetSelectionMode.ctaLabel}
          </GameButton>
          {targetSelectionMode.canSkip && (
            <GameButton
              variant="secondary"
              size="sm"
              className={IN_BOARD_BTN}
              onClick={targetSelectionMode.onSkip}
            >
              Skip
            </GameButton>
          )}
        </div>
      )}

      {/* Undo */}
      {canUndo && (
        <GameButton
          variant="secondary"
          size="sm"
          className={IN_BOARD_BTN}
          onClick={() => onAction({ type: "UNDO" })}
        >
          Undo
        </GameButton>
      )}

      {/* Phase actions */}
      {canEndPhase && (
        <GameButton
          variant="green"
          size="sm"
          className={IN_BOARD_BTN}
          onClick={() => onAction({ type: "ADVANCE_PHASE" })}
        >
          End {phase} &rarr;
        </GameButton>
      )}

      {/* Blocker selection: Block + Skip */}
      {blockerMode ? (
        <>
          {blockerMode.selectedBlockerId ? (
            <GameButton
              variant="green"
              size="sm"
              className={IN_BOARD_BTN}
              data-blocker-selection-control=""
              onClick={blockerMode.onBlock}
            >
              Block
            </GameButton>
          ) : (
            <MidZoneDisabledBtn>Block</MidZoneDisabledBtn>
          )}
          <GameButton
            variant="secondary"
            size="sm"
            className={IN_BOARD_BTN}
            data-blocker-selection-control=""
            onClick={() => onAction({ type: "PASS" })}
          >
            Skip
          </GameButton>
        </>
      ) : (
        canPass && (
          <GameButton
            variant="secondary"
            size="sm"
            className={IN_BOARD_BTN}
            onClick={() => onAction({ type: "PASS" })}
          >
            Pass
          </GameButton>
        )
      )}

      {!isMyTurn && !inBattle && (
        <Spinner className="text-gb-text-dim size-4" />
      )}
    </div>
  );
});
