"use client";

import React from "react";
import type { CardDb, CardInstance } from "@shared/game-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Badge,
  TooltipProvider,
} from "@/components/ui";
import { Card } from "./card";

interface TrashPreviewModalProps {
  trash: CardInstance[];
  cardDb: CardDb;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrashPreviewModal({
  trash,
  cardDb,
  title,
  open,
  onOpenChange,
}: TrashPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gb-border space-y-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-sm font-bold text-gb-text-bright">
              {title}
            </DialogTitle>
            <Badge
              variant="secondary"
              className="bg-gb-surface-raised text-gb-text-muted border-gb-border-strong"
            >
              {trash.length} {trash.length === 1 ? "card" : "cards"}
            </Badge>
          </div>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
        <div className="overflow-y-auto px-6 py-6">
          {trash.length === 0 ? (
            <p className="text-sm text-gb-text-dim text-center py-8 italic">
              No cards in trash
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {trash.map((card, i) => (
                <Card
                  key={`${card.instanceId}-${i}`}
                  variant="modal"
                  size="field"
                  data={{ card, cardId: card.cardId, cardDb }}
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
