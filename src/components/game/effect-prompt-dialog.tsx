"use client";

import React, { useId } from "react";
import type { CardDb, PromptSourceCard } from "@shared/game-types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TooltipProvider,
} from "@/components/ui";
import { EffectText } from "@/components/cards/effect-text";
import {
  promptDialogTitle,
  promptSourceCardName,
} from "@/lib/game/prompt-presentation";
import { GameButton } from "./game-button";

export interface EffectPromptDialogProps {
  /** Effect text the prompt resolves. Its leading timing token names the dialog. */
  effectDescription: string;
  /** Card whose effect raised the prompt; its name heads the description. */
  sourceCard?: Pick<PromptSourceCard, "cardId">;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  /** Submits the current choice. */
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /**
   * Declines the choice. When omitted the Skip button still renders, disabled,
   * so every prompt shows the same two actions.
   */
  onSkip?: () => void;
  /** Footer-left status such as "1 of 2 selected". */
  status?: React.ReactNode;
  /** Secondary line under the effect text (a source effect, an instruction). */
  note?: React.ReactNode;
  /** The selectable content: cards, choice rows, steppers. */
  children?: React.ReactNode;
  /** Width override for the dialog panel. */
  className?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * The one frame every card-effect prompt renders through (see
 * docs/design/INTERRUPTION-MODALS.md): the effect timing in the title, the
 * source card's name over its effect text, the choice, then Skip and Confirm.
 */
export function EffectPromptDialog({
  effectDescription,
  sourceCard,
  cardDb,
  isHidden,
  onHide,
  onConfirm,
  confirmDisabled = false,
  onSkip,
  status,
  note,
  children,
  className,
  onEscapeKeyDown,
}: EffectPromptDialogProps) {
  const descriptionId = useId();
  const title = promptDialogTitle(effectDescription);
  const sourceName = promptSourceCardName(cardDb, sourceCard);

  return (
    <Dialog
      open={!isHidden}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent
        aria-describedby={descriptionId}
        showCloseButton={false}
        onEscapeKeyDown={onEscapeKeyDown}
        className={cn(
          "bg-gb-surface border-gb-border-strong text-gb-text flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]",
          className
        )}
      >
        <DialogHeader className="border-gb-border flex-row items-center justify-between space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-gb-text-subtle text-sm font-semibold">
            {title}
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <DialogDescription asChild>
              <div id={descriptionId} className="flex flex-col gap-1">
                {sourceName && (
                  <p className="text-gb-text-bright text-sm font-semibold">
                    {sourceName}
                  </p>
                )}
                <EffectText
                  text={effectDescription}
                  className="text-gb-text text-sm leading-snug"
                />
                {note}
              </div>
            </DialogDescription>
            {children}
          </div>
        </TooltipProvider>

        <DialogFooter className="border-gb-border flex-row items-center justify-between gap-2 border-t px-4 py-3 pt-3">
          <span className="text-gb-text-dim text-sm">{status}</span>
          <div className="flex items-center gap-2">
            <GameButton
              variant="secondary"
              size="sm"
              disabled={!onSkip}
              onClick={onSkip}
            >
              Skip
            </GameButton>
            <GameButton
              variant={confirmDisabled ? "secondary" : "amber"}
              size="sm"
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              Confirm
            </GameButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
