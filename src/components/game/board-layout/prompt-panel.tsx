"use client";

import React from "react";
import type {
  CardDb,
  GameAction,
  PromptOptions,
  PromptSourceCard,
} from "@shared/game-types";
import { cn } from "@/lib/utils";
import { EffectInline } from "@/components/cards/effect-text";
import { promptDialogTitle } from "@/lib/game/prompt-presentation";
import { GameButton } from "../game-button";
import { CardTooltip } from "../use-card-tooltip";
import type { RedistributeTransfer } from "./use-redistribution-state";

/**
 * The board's prompt panel (OPT-776). It sits in the left column and is the
 * one place that says what the player can do now: the instruction for a
 * pending prompt with its Skip and Confirm, the block and counter steps, the
 * battle readout, and the phase controls (Undo, End Turn, Pass). The strip
 * between the two fields is left empty.
 *
 * The panel renders at native pixels (outside the board's `zoom` wrapper), so
 * it uses chrome sizes: `text-base` instruction, `text-sm` card name, counts
 * and buttons. Each prompt reads card name, then instruction, then selection.
 */

export interface BattleInfo {
  attackerName: string;
  attackerPower: number;
  defenderName: string;
  defenderPower: number;
  counterPowerAdded: number;
  battleSubPhase: string;
}

export interface BlockerMode {
  selectedBlockerId: string | null;
  onBlock: () => void;
}

export interface TargetSelectionMode {
  effectDescription: string;
  /** Worker-written short instruction (OPT-775); preferred over the effect text. */
  instruction?: string;
  sourceCard?: PromptSourceCard;
  countLabel: string;
  selectedCount: number;
  aggregateLabel: string | null;
  canConfirm: boolean;
  canSkip: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}

export interface RedistributeMode {
  effectDescription: string;
  maxTransfers: number;
  transfers: RedistributeTransfer[];
  onUndo: () => void;
}

/** Panel buttons: raised surface with the small hard elevation shadow. */
const IN_BOARD_BTN = "text-sm shadow-sm focus-visible:ring-4";

function formatPower(power: number): string {
  return power >= 1000 ? `${(power / 1000).toFixed(0)}K` : String(power);
}

function stepLabel(subPhase: string): string {
  const words = subPhase.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function phaseLabel(phase: string): string {
  if (!phase) return "";
  return `${stepLabel(phase)} phase`;
}

export function getPromptAnnouncement(
  activePrompt: PromptOptions | null,
  blockerMode?: BlockerMode,
  targetSelectionMode?: TargetSelectionMode,
  isPromptHidden?: boolean
): string {
  if (targetSelectionMode) {
    const what =
      targetSelectionMode.instruction ||
      targetSelectionMode.effectDescription ||
      "Choose targets";
    return `Action required. ${what}. ${targetSelectionMode.selectedCount} selected.`;
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

/** Short, player-facing name for a prompt answered in a modal window. */
function modalPromptLabel(prompt: PromptOptions): string {
  switch (prompt.promptType) {
    case "SELECT_BLOCKER":
      return "Choose a Blocker";
    case "REVEAL_TRIGGER":
      return "Life card revealed";
    case "REDISTRIBUTE_DON":
      return "Move DON!!";
    default:
      return promptDialogTitle(prompt.effectDescription, prompt.actionLabel);
  }
}

const BattleReadout = React.memo(function BattleReadout({
  info,
}: {
  info: BattleInfo;
}) {
  const boosted = info.counterPowerAdded > 0;
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
      data-battle-readout=""
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-gb-text-bright text-base font-semibold tabular-nums">
          {formatPower(info.attackerPower)}
        </span>
        <span className="text-gb-text-subtle truncate text-sm">
          {info.attackerName}
        </span>
      </div>
      <span className="text-gb-text-dim text-sm font-semibold">VS</span>
      <div className="flex min-w-0 flex-col items-end text-right">
        <span className="flex items-baseline gap-1">
          <span
            className={cn(
              "text-base font-semibold tabular-nums",
              boosted ? "text-gb-accent-green" : "text-gb-text-bright"
            )}
          >
            {formatPower(info.defenderPower)}
          </span>
          {boosted && (
            <span className="text-gb-accent-green/70 text-sm font-semibold tabular-nums">
              +{formatPower(info.counterPowerAdded)}
            </span>
          )}
        </span>
        <span className="text-gb-text-subtle w-full truncate text-sm">
          {info.defenderName}
        </span>
      </div>
    </div>
  );
});

function Eyebrow({
  tone,
  children,
}: {
  tone: "battle" | "counter" | "quiet";
  children: React.ReactNode;
}) {
  return (
    <span
      data-panel-eyebrow={tone}
      className={cn(
        "text-sm font-semibold uppercase tracking-wider",
        tone === "battle" && "text-gb-accent-amber",
        tone === "counter" && "text-gb-accent-red",
        tone === "quiet" && "text-gb-text-dim"
      )}
    >
      {children}
    </span>
  );
}

function SourceCardChip({
  sourceCard,
  cardDb,
}: {
  sourceCard: PromptSourceCard;
  cardDb: CardDb;
}) {
  const data = cardDb[sourceCard.cardId] ?? null;
  return (
    <CardTooltip data={data} cardId={sourceCard.cardId}>
      <span
        tabIndex={data ? 0 : undefined}
        className="text-gb-text-dim w-fit cursor-help text-sm font-semibold underline decoration-gb-text-subtle underline-offset-2 outline-none hover:decoration-current focus-visible:ring-4 focus-visible:ring-gb-accent-blue"
      >
        {data?.name ?? sourceCard.cardId}
      </span>
    </CardTooltip>
  );
}

export interface PromptPanelProps {
  isMyTurn: boolean;
  phase: string;
  canEndPhase: boolean;
  canPass: boolean;
  activePrompt: PromptOptions | null;
  rejectionReason: string | null;
  battleInfo: BattleInfo | null;
  blockerMode?: BlockerMode;
  targetSelectionMode?: TargetSelectionMode;
  redistributeMode?: RedistributeMode;
  /** The opponent owes a prompt response; this player waits. */
  opponentChoosing?: boolean;
  isPromptHidden?: boolean;
  onShowPrompt?: () => void;
  canUndo?: boolean;
  cardDb: CardDb;
  onAction: (action: GameAction) => void;
}

export const PromptPanel = React.memo(function PromptPanel({
  isMyTurn,
  phase,
  canEndPhase,
  canPass,
  activePrompt,
  rejectionReason,
  battleInfo,
  blockerMode,
  targetSelectionMode,
  redistributeMode,
  opponentChoosing = false,
  isPromptHidden,
  onShowPrompt,
  canUndo,
  cardDb,
  onAction,
}: PromptPanelProps) {
  const promptAnnouncement = getPromptAnnouncement(
    activePrompt,
    blockerMode,
    targetSelectionMode,
    isPromptHidden
  );

  let eyebrow: React.ReactNode = null;
  let body: React.ReactNode = null;
  const actions: React.ReactNode[] = [];

  if (targetSelectionMode) {
    body = (
      <>
        {targetSelectionMode.sourceCard && (
          <SourceCardChip
            sourceCard={targetSelectionMode.sourceCard}
            cardDb={cardDb}
          />
        )}
        <p className="text-gb-text-bright text-base leading-snug">
          <EffectInline
            text={
              targetSelectionMode.instruction ||
              targetSelectionMode.effectDescription ||
              "Choose targets"
            }
          />
        </p>
        <p className="text-gb-text-dim text-sm">
          {targetSelectionMode.countLabel} &middot;{" "}
          {targetSelectionMode.selectedCount} selected
          {targetSelectionMode.aggregateLabel && (
            <span className="text-gb-text-subtle">
              {" "}&middot; {targetSelectionMode.aggregateLabel}
            </span>
          )}
        </p>
      </>
    );
    if (targetSelectionMode.canSkip) {
      actions.push(
        <GameButton
          key="skip"
          variant="secondary"
          size="sm"
          className={IN_BOARD_BTN}
          onClick={targetSelectionMode.onSkip}
        >
          Skip
        </GameButton>
      );
    }
    actions.push(
      <GameButton
        key="confirm"
        variant={targetSelectionMode.canConfirm ? "green" : "secondary"}
        size="sm"
        className={IN_BOARD_BTN}
        disabled={!targetSelectionMode.canConfirm}
        onClick={targetSelectionMode.onConfirm}
      >
        Confirm
      </GameButton>
    );
  } else if (blockerMode) {
    eyebrow = <Eyebrow tone="battle">Block step</Eyebrow>;
    body = (
      <>
        {battleInfo && <BattleReadout info={battleInfo} />}
        <p className="text-gb-text text-base leading-snug">
          {blockerMode.selectedBlockerId
            ? "Block with the selected Character?"
            : "Choose a Blocker, or skip."}
        </p>
      </>
    );
    actions.push(
      <GameButton
        key="skip"
        variant="secondary"
        size="sm"
        className={IN_BOARD_BTN}
        data-blocker-selection-control=""
        onClick={() => onAction({ type: "PASS" })}
      >
        Skip
      </GameButton>,
      <GameButton
        key="block"
        variant={blockerMode.selectedBlockerId ? "green" : "secondary"}
        size="sm"
        className={IN_BOARD_BTN}
        data-blocker-selection-control=""
        disabled={!blockerMode.selectedBlockerId}
        onClick={blockerMode.onBlock}
      >
        Block
      </GameButton>
    );
  } else if (redistributeMode) {
    const { transfers, maxTransfers } = redistributeMode;
    const remaining = Math.max(0, maxTransfers - transfers.length);
    body = (
      <>
        <p className="text-gb-text-bright text-base leading-snug">
          <EffectInline
            text={
              redistributeMode.effectDescription ||
              "Drag DON!! between your cards."
            }
          />
        </p>
        <p className="text-gb-text-dim text-sm">
          {transfers.length} moved &middot; {remaining} remaining
        </p>
      </>
    );
    actions.push(
      <GameButton
        key="undo"
        variant="ghost"
        size="sm"
        className={IN_BOARD_BTN}
        onClick={redistributeMode.onUndo}
        disabled={transfers.length === 0}
      >
        Undo
      </GameButton>,
      <GameButton
        key="skip"
        variant="secondary"
        size="sm"
        className={IN_BOARD_BTN}
        onClick={() => onAction({ type: "REDISTRIBUTE_DON", transfers: [] })}
      >
        Skip
      </GameButton>,
      <GameButton
        key="confirm"
        variant={transfers.length > 0 ? "green" : "secondary"}
        size="sm"
        className={IN_BOARD_BTN}
        onClick={() => onAction({ type: "REDISTRIBUTE_DON", transfers })}
        disabled={transfers.length === 0}
      >
        Confirm
      </GameButton>
    );
  } else if (activePrompt) {
    const promptSource =
      "sourceCard" in activePrompt ? activePrompt.sourceCard : undefined;
    body = (
      <>
        {promptSource && (
          <SourceCardChip sourceCard={promptSource} cardDb={cardDb} />
        )}
        <p className="text-gb-text-bright text-base leading-snug">
          {modalPromptLabel(activePrompt)}
        </p>
        <p className="text-gb-text-dim text-sm">
          {isPromptHidden
            ? "The prompt is hidden. Show it to respond."
            : "Respond in the prompt window."}
        </p>
      </>
    );
    if (isPromptHidden) {
      actions.push(
        <GameButton
          key="show"
          variant="green"
          size="sm"
          className={IN_BOARD_BTN}
          onClick={onShowPrompt ?? (() => {})}
        >
          Show Prompt
        </GameButton>
      );
    } else {
      if (
        activePrompt.promptType === "REVEAL_TRIGGER" &&
        !activePrompt.cards?.length
      ) {
        actions.push(
          <GameButton
            key="reveal"
            variant="secondary"
            size="sm"
            className={IN_BOARD_BTN}
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: true })}
          >
            Reveal
          </GameButton>,
          <GameButton
            key="to-hand"
            variant="secondary"
            size="sm"
            className={IN_BOARD_BTN}
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: false })}
          >
            Add to Hand
          </GameButton>
        );
      }
      if ("optional" in activePrompt && activePrompt.optional) {
        actions.push(
          <GameButton
            key="skip"
            variant="secondary"
            size="sm"
            className={IN_BOARD_BTN}
            onClick={() => onAction({ type: "PASS" })}
          >
            Skip
          </GameButton>
        );
      }
    }
  } else if (opponentChoosing) {
    eyebrow = <Eyebrow tone="quiet">Opponent is choosing</Eyebrow>;
    body = battleInfo ? <BattleReadout info={battleInfo} /> : null;
  } else if (battleInfo) {
    const counter = battleInfo.battleSubPhase === "COUNTER_STEP";
    eyebrow = (
      <Eyebrow tone={counter ? "counter" : "battle"}>
        {stepLabel(battleInfo.battleSubPhase)}
      </Eyebrow>
    );
    body = (
      <>
        <BattleReadout info={battleInfo} />
        {counter && canPass && (
          <p className="text-gb-text-dim text-sm">
            Drag Counter cards onto the defender, or pass.
          </p>
        )}
      </>
    );
  } else if (isMyTurn && phase) {
    eyebrow = <Eyebrow tone="quiet">{phaseLabel(phase)}</Eyebrow>;
  }

  if (canUndo) {
    actions.unshift(
      <GameButton
        key="undo-action"
        variant="secondary"
        size="sm"
        className={IN_BOARD_BTN}
        onClick={() => onAction({ type: "UNDO" })}
      >
        Undo
      </GameButton>
    );
  }
  if (canEndPhase) {
    actions.push(
      <GameButton
        key="end-phase"
        variant="green"
        size="sm"
        className={IN_BOARD_BTN}
        onClick={() => onAction({ type: "ADVANCE_PHASE" })}
      >
        {phase === "MAIN" ? "End Turn" : `End ${phaseLabel(phase)}`}
      </GameButton>
    );
  }
  if (canPass && !blockerMode) {
    actions.push(
      <GameButton
        key="pass"
        variant="secondary"
        size="sm"
        className={IN_BOARD_BTN}
        onClick={() => onAction({ type: "PASS" })}
      >
        Pass
      </GameButton>
    );
  }

  const hasContent =
    eyebrow !== null || body !== null || actions.length > 0 || !!rejectionReason;

  return (
    <section
      aria-label="Prompt panel"
      data-prompt-panel=""
      data-target-selection-control=""
      className={cn(
        "flex w-full flex-col gap-3",
        hasContent &&
          "border-gb-border-strong bg-gb-surface-raised rounded-r-lg border border-l-0 p-4 shadow-md"
      )}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {promptAnnouncement}
      </p>
      {eyebrow}
      {body}
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-start gap-2">
          {actions}
        </div>
      )}
      {rejectionReason && (
        <p role="status" aria-live="polite" className="text-gb-text-dim text-sm">
          <span className="text-gb-accent-amber font-semibold">Not available.</span>{" "}
          {rejectionReason}
        </p>
      )}
    </section>
  );
});
