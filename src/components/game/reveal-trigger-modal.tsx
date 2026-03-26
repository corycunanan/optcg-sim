"use client";

import React from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useCardTooltip } from "./use-card-tooltip";

const CARD_W = 80;
const CARD_H = 112;

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
  if (isHidden) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-gb-surface border border-gb-border-strong rounded-lg flex flex-col"
        style={{ width: 400, maxWidth: "calc(100vw - 32px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gb-border">
          <span className="text-xs font-semibold text-gb-text-subtle tracking-wider uppercase">
            Trigger
          </span>
          <button
            onClick={onHide}
            className="text-xs text-gb-text-dim hover:text-gb-text px-2 py-1 rounded-md hover:bg-gb-surface-raised transition-colors cursor-pointer"
          >
            Hide
          </button>
        </div>

        {/* Body */}
        <div className="flex items-start gap-4 px-4 py-4">
          {cards[0] && (
            <TriggerCard card={cards[0]} cardDb={cardDb} />
          )}
          <p className="flex-1 text-sm text-gb-text leading-snug pt-1">
            {effectDescription}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-4">
          <button
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: true })}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-semibold rounded-md border transition-colors cursor-pointer",
              "bg-gb-accent-navy text-white border-gb-accent-navy",
              "hover:opacity-90",
            )}
          >
            Reveal &amp; Activate
          </button>
          <button
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: false })}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer",
              "bg-gb-surface-raised text-gb-text border-gb-border-strong",
              "hover:border-gb-text-muted hover:text-gb-text-bright",
            )}
          >
            Add to Hand
          </button>
        </div>
      </div>
    </div>
  );
}

function TriggerCard({ card, cardDb }: { card: CardInstance; cardDb: CardDb }) {
  const data = cardDb[card.cardId] ?? null;
  const { triggerRef, hoverHandlers, portal } = useCardTooltip(data, card.cardId, card);

  return (
    <>
      <div
        ref={triggerRef}
        {...hoverHandlers}
        className="rounded-md overflow-hidden border border-gb-border-strong shrink-0"
        style={{ width: CARD_W, height: CARD_H }}
      >
        {data?.imageUrl ? (
          <img src={data.imageUrl} alt={data.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full bg-gb-surface-raised flex items-center justify-center p-2">
            <span className="text-xs text-gb-text-dim text-center leading-tight">{data?.name ?? "?"}</span>
          </div>
        )}
      </div>
      {portal}
    </>
  );
}
