"use client";

import React, { useMemo } from "react";
import type { CardDb, LifeCard } from "@shared/game-types";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  TooltipProvider,
} from "@/components/ui";
import { Card } from "./card";

interface LifePreviewModalProps {
  life: LifeCard[];
  cardDb: CardDb;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Life identity is hidden even when the receiving client happens to know it.
 * Only explicitly face-up, non-redacted cards may cross into preview rendering.
 */
export function getInspectableLifeCards(life: LifeCard[]): LifeCard[] {
  return life.filter((card) => card.face === "UP" && card.cardId !== "hidden");
}

export function LifePreviewModal({
  life,
  cardDb,
  title,
  open,
  onOpenChange,
}: LifePreviewModalProps) {
  const faceUpCards = useMemo(() => getInspectableLifeCards(life), [life]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-gb-border-strong bg-gb-surface text-gb-text flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="border-gb-border space-y-2 border-b px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-gb-text-bright">
              {title}
            </DialogTitle>
            <Badge
              variant="secondary"
              className="border-gb-border-strong bg-gb-surface-raised text-gb-text-muted"
            >
              {life.length} {life.length === 1 ? "card" : "cards"}
            </Badge>
          </div>
          <p className="text-gb-text-dim text-xs">
            Face-down cards stay hidden. Only face-up Life is shown.
          </p>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <div className="overflow-y-auto px-6 py-6">
            {faceUpCards.length === 0 ? (
              <p className="text-gb-text-dim py-8 text-center text-sm italic">
                No face-up Life cards to show
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {faceUpCards.map((card) => (
                  <Card
                    key={card.instanceId}
                    variant="modal"
                    size="field"
                    data={{ cardId: card.cardId, cardDb }}
                  />
                ))}
              </div>
            )}
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
