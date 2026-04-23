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

interface OptionalEffectModalProps {
  effectDescription: string;
  card?: CardInstance;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function OptionalEffectModal({
  effectDescription,
  card,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: OptionalEffectModalProps) {
  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[400px] p-0 gap-0"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-xs font-semibold text-gb-text-subtle tracking-wider uppercase">
            Optional Effect
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="flex items-start gap-4 px-4 py-4">
            {card && (
              <Card
                variant="modal"
                size="field"
                data={{ card, cardId: card.cardId, cardDb }}
                className="shrink-0"
              />
            )}
            <p className="flex-1 text-sm text-gb-text leading-snug pt-1">
              {effectDescription}
            </p>
          </div>
        </TooltipProvider>

        <DialogFooter className="flex-row gap-2 px-4 pb-4 pt-0">
          <GameButton
            variant="primary"
            onClick={() => onAction({ type: "PLAYER_CHOICE", choiceId: "activate" })}
            className="flex-1"
          >
            Activate
          </GameButton>
          <GameButton
            variant="secondary"
            onClick={() => onAction({ type: "PASS" })}
            className="flex-1"
          >
            Skip
          </GameButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
