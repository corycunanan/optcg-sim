"use client";

import React from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  TooltipProvider,
} from "@/components/ui";
import { GameButton } from "./game-button";
import { Card } from "./card";

interface RevealTriggerModalProps {
  cards: CardInstance[];
  effectDescription: string;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function RevealTriggerModal({
  cards,
  effectDescription,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: RevealTriggerModalProps) {
  const firstCard = cards[0];
  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[400px] p-0 gap-0"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-xs font-semibold text-gb-text-subtle tracking-wider uppercase">
            Trigger
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="flex items-start gap-4 px-4 py-4">
            {firstCard && (
              <Card
                variant="modal"
                size="field"
                data={{ card: firstCard, cardId: firstCard.cardId, cardDb }}
                className="shrink-0"
              />
            )}
            <p className="flex-1 text-sm text-gb-text leading-snug pt-1">
              {effectDescription}
            </p>
          </div>
        </TooltipProvider>

        <DialogFooter className="flex-row gap-2 px-4 py-4 pt-0">
          <GameButton
            variant="primary"
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: true })}
            className="flex-1"
          >
            Reveal &amp; Activate
          </GameButton>
          <GameButton
            variant="secondary"
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: false })}
            className="flex-1"
          >
            Add to Hand
          </GameButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
