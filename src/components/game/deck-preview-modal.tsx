"use client";

import React, { useMemo } from "react";
import type { CardDb, DeckListEntry } from "@shared/game-types";
import { cn } from "@/lib/utils";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogTitle,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { VisuallyHidden } from "radix-ui";
import { CardTooltipContent } from "./board-card";

interface GameDeckPreviewModalProps {
  deckList: DeckListEntry[];
  cardDb: CardDb;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CardGroup {
  cardId: string;
  name: string;
  cost: number | null;
  type: string;
  count: number;
}

/** Deterministic pseudo-random rotation for a card instance. */
function cardRotation(cardId: string, index: number): number {
  let hash = index * 31;
  for (let i = 0; i < cardId.length; i++) {
    hash = (hash * 37 + cardId.charCodeAt(i)) & 0xffff;
  }
  return ((hash % 100) / 100) * 3 - 1.5;
}

/** Build card groups from the original deck list. */
function groupDeck(deckList: DeckListEntry[], cardDb: CardDb): CardGroup[] {
  return deckList
    .map((entry) => {
      const data = cardDb[entry.cardId];
      return {
        cardId: entry.cardId,
        name: data?.name ?? entry.cardId,
        cost: data?.cost ?? null,
        type: data?.type ?? "Unknown",
        count: entry.count,
      };
    })
    .sort((a, b) => {
      const costA = a.cost ?? -1;
      const costB = b.cost ?? -1;
      if (costA !== costB) return costA - costB;
      return a.name.localeCompare(b.name);
    });
}

export function GameDeckPreviewModal({
  deckList,
  cardDb,
  title,
  open,
  onOpenChange,
}: GameDeckPreviewModalProps) {
  const groups = useMemo(() => groupDeck(deckList, cardDb), [deckList, cardDb]);
  const totalCards = deckList.reduce((sum, e) => sum + e.count, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-6xl"
      >
        <VisuallyHidden.Root>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden.Root>

        <div className="flex overflow-hidden">
          {/* Left sidebar — card count + cost curve */}
          <div className="flex w-48 flex-shrink-0 flex-col gap-6 border-r border-gb-border px-6 py-6">
            <div>
              <h3 className="text-base font-semibold text-gb-text-bright">
                {title}
              </h3>
              <p className="mt-1 text-sm text-gb-text-dim">
                {totalCards} cards
              </p>
            </div>

            {/* Cost curve */}
            <div className="flex flex-col gap-1">
              {Array.from({ length: 11 }, (_, cost) => {
                const count = groups.reduce(
                  (sum, g) =>
                    sum +
                    (g.type !== "Leader" && g.cost === cost ? g.count : 0),
                  0,
                );
                return (
                  <div key={cost} className="flex items-center text-sm">
                    <Badge
                      variant="secondary"
                      className="w-1/2 justify-center px-0 py-1 text-sm bg-gb-surface-raised text-gb-text-muted border-gb-border-strong"
                    >
                      {cost}
                    </Badge>
                    <span className="w-1/2 text-center text-gb-text-dim">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card grid */}
          <TooltipProvider delayDuration={200} disableHoverableContent>
          <div className="overflow-y-auto px-6 py-6">
            <div className="flex flex-wrap justify-start gap-4">
              {groups.map((group) => {
                const data = cardDb[group.cardId];
                return (
                  <TooltipRoot key={group.cardId}>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-pointer">
                        {Array.from({ length: group.count }, (_, i) => (
                          <div
                            key={`${group.cardId}-${i}`}
                            className={cn(
                              "relative flex-shrink-0 transition-transform duration-150 hover:-translate-y-2 hover:z-10",
                              i > 0 && "-ml-16",
                            )}
                            style={{
                              zIndex: group.count - i,
                              ...(i > 0 && {
                                rotate: `${cardRotation(group.cardId, i)}deg`,
                              }),
                            }}
                          >
                            <div className="w-[100px] overflow-hidden rounded-md border border-gb-border-strong shadow-sm aspect-[600/838]">
                              {data?.imageUrl ? (
                                <img
                                  src={data.imageUrl}
                                  alt={data.name}
                                  className={cn(
                                    "h-full w-full object-cover",
                                    group.count > 1 &&
                                      i > 0 &&
                                      "brightness-90",
                                  )}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-full w-full bg-gb-surface-raised flex items-center justify-center p-2">
                                  <span className="text-xs text-gb-text-dim text-center">
                                    {group.name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={8}
                      className="w-72 bg-gb-surface border-gb-border-strong text-gb-text rounded-md p-3 shadow-lg"
                    >
                      {data && (
                        <CardTooltipContent
                          data={data}
                          cardId={group.cardId}
                        />
                      )}
                    </TooltipContent>
                  </TooltipRoot>
                );
              })}
            </div>
          </div>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
