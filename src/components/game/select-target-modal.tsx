"use client";

import React, { useState } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useCardTooltip } from "./use-card-tooltip";

const CARD_W = 80;
const CARD_H = 112;

function TargetCard({
  card,
  cardDb,
  selected,
  invalid,
  onToggle,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selected: boolean;
  invalid: boolean;
  onToggle: () => void;
}) {
  const data = cardDb[card.cardId] ?? null;
  const { triggerRef, hoverHandlers, portal } = useCardTooltip(data, card.cardId, card);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={invalid ? undefined : onToggle}
        {...hoverHandlers}
        className={cn(
          "relative rounded-md overflow-hidden border-2 transition-colors select-none shrink-0",
          invalid
            ? "opacity-30 cursor-not-allowed border-transparent"
            : selected
              ? "border-gb-accent-amber ring-2 ring-gb-accent-amber/30 cursor-pointer"
              : "border-transparent hover:border-gb-border-strong cursor-pointer",
        )}
        style={{ width: CARD_W, height: CARD_H }}
      >
        {data?.imageUrl ? (
          <img
            src={data.imageUrl}
            alt={data.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gb-surface-raised flex flex-col items-center justify-center gap-1 p-2">
            <span className="text-xs text-gb-text-dim text-center leading-tight">
              {data?.name ?? "?"}
            </span>
            {data?.cost !== null && data?.cost !== undefined && (
              <span className="text-xs text-gb-text-subtle">{data.cost}</span>
            )}
          </div>
        )}

        {selected && (
          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gb-accent-amber flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2 2 4-4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      {portal}
    </>
  );
}

interface SelectTargetModalProps {
  cards: CardInstance[];
  validTargets: string[];
  effectDescription: string;
  countMin: number;
  countMax: number;
  ctaLabel: string;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function SelectTargetModal({
  cards,
  validTargets,
  effectDescription,
  countMin,
  countMax,
  ctaLabel,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: SelectTargetModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (isHidden) return null;

  const validSet = new Set(validTargets);

  function toggleCard(instanceId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else if (next.size < countMax) {
        next.add(instanceId);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (selectedIds.size < countMin) return;
    onAction({ type: "SELECT_TARGET", selectedInstanceIds: [...selectedIds] });
  }

  const canConfirm = selectedIds.size >= countMin;

  const countLabel =
    countMin === countMax
      ? `Select ${countMin}`
      : countMin === 0
        ? `Select up to ${countMax}`
        : `Select ${countMin}–${countMax}`;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-gb-surface border border-gb-border-strong rounded-lg flex flex-col"
        style={{ width: 520, maxWidth: "calc(100vw - 32px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gb-border">
          <span className="text-sm font-bold text-gb-text-bright">
            {effectDescription}
          </span>
          <button
            onClick={onHide}
            className="text-xs text-gb-text-dim hover:text-gb-text px-2 py-1 rounded-md hover:bg-gb-surface-raised transition-colors cursor-pointer"
          >
            Hide
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: 300 }}>
          <div
            className={cn("flex flex-wrap gap-2", cards.length <= 5 ? "justify-center" : "justify-start")}
            style={{ maxWidth: `${CARD_W * 5 + 8 * 4}px`, margin: "0 auto" }}
          >
            {cards.map((card) => (
              <TargetCard
                key={card.instanceId}
                card={card}
                cardDb={cardDb}
                selected={selectedIds.has(card.instanceId)}
                invalid={!validSet.has(card.instanceId)}
                onToggle={() => toggleCard(card.instanceId)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gb-border">
          <span className="text-xs text-gb-text-dim">
            {countLabel}
            {selectedIds.size > 0 && (
              <span className="text-gb-text-subtle ml-1">
                — {selectedIds.size} selected
              </span>
            )}
          </span>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "px-3 py-2 text-xs font-bold rounded-md border transition-colors",
              canConfirm
                ? "bg-gb-accent-amber/15 text-gb-accent-amber border-gb-accent-amber/30 hover:border-gb-accent-amber/60 cursor-pointer"
                : "opacity-40 cursor-not-allowed bg-gb-surface-raised text-gb-text border-gb-border-strong",
            )}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
