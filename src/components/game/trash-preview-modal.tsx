"use client";

import React from "react";
import type { CardDb, CardInstance } from "@shared/game-types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Badge,
  TooltipProvider,
} from "@/components/ui";
import { CardTooltip } from "./use-card-tooltip";

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
                <TrashCard
                  key={`${card.instanceId}-${i}`}
                  card={card}
                  cardDb={cardDb}
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

const CARD_W = 100;

function TrashCard({
  card,
  cardDb,
}: {
  card: CardInstance;
  cardDb: CardDb;
}) {
  const data = cardDb[card.cardId] ?? null;

  return (
    <CardTooltip data={data} cardId={card.cardId} card={card}>
      <div
        className={cn(
          "overflow-hidden rounded-md border border-gb-border-strong shadow-sm cursor-pointer",
          "transition-transform duration-150 hover:-translate-y-1 hover:shadow-md",
        )}
        style={{ width: CARD_W, aspectRatio: "600/838" }}
      >
        {data?.imageUrl ? (
          <img
            src={data.imageUrl}
            alt={data.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gb-surface-raised flex flex-col items-center justify-center gap-1 p-2">
            <span className="text-xs text-gb-text-dim text-center leading-tight">
              {data?.name ?? card.cardId}
            </span>
            {data?.cost != null && (
              <span className="text-xs text-gb-text-subtle">{data.cost}</span>
            )}
          </div>
        )}
      </div>
    </CardTooltip>
  );
}
