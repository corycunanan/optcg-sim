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
import { EffectText } from "@/components/cards/effect-text";

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
    <Dialog
      open={!isHidden}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent
        aria-describedby="reveal-trigger-modal-description"
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text gap-0 p-0 sm:max-w-[400px]"
      >
        <DialogHeader className="border-gb-border flex-row items-center justify-between space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-gb-text-subtle">Trigger</DialogTitle>
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
            <div id="reveal-trigger-modal-description" className="flex-1 pt-1">
              <EffectText
                text={effectDescription}
                className="text-gb-text text-sm leading-snug"
              />
            </div>
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
