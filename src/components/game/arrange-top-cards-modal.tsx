"use client";

import React, { useState } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from "@/components/ui";
import { CardTooltip } from "./use-card-tooltip";

const CARD_W = 80;
const CARD_H = 112;

function ModalCard({
  card,
  cardDb,
  selected,
  dimmed,
  isDragOver,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selected?: boolean;
  dimmed?: boolean;
  isDragOver?: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const data = cardDb[card.cardId] ?? null;

  return (
    <CardTooltip data={data} cardId={card.cardId} card={card}>
      <div
        draggable
        onClick={onSelect}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
        className={cn(
          "relative rounded-md overflow-hidden cursor-grab border-2 transition-colors select-none shrink-0",
          selected
            ? "border-gb-accent-amber ring-2 ring-gb-accent-amber/30"
            : isDragOver
              ? "border-gb-accent-blue"
              : "border-transparent hover:border-gb-border-strong",
          dimmed && "opacity-40",
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
    </CardTooltip>
  );
}

interface ArrangeTopCardsModalProps {
  cards: CardInstance[];
  effectDescription: string;
  canSendToBottom: boolean;
  /** If provided, only these instanceIds may be selected to add to hand */
  validTargets?: string[];
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function ArrangeTopCardsModal({
  cards: initialCards,
  effectDescription,
  canSendToBottom,
  validTargets,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: ArrangeTopCardsModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [orderedCards, setOrderedCards] = useState<CardInstance[]>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keptCardInstanceId, setKeptCardInstanceId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // If validTargets is provided, only those cards can be selected
  const canSelectCard = (instanceId: string) =>
    validTargets === undefined || validTargets.includes(instanceId);

  function handleDragStart(i: number) {
    setDragIndex(i);
  }

  function handleDragOver(i: number) {
    if (dragIndex === null || dragIndex === i) return;
    setDropIndex(i);
  }

  function handleDrop(i: number) {
    if (dragIndex !== null && dragIndex !== i) {
      const next = [...orderedCards];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      setOrderedCards(next);
    }
    setDragIndex(null);
    setDropIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  function handleAddToHand() {
    if (!selectedId) return;
    setKeptCardInstanceId(selectedId);
    setOrderedCards((prev) => prev.filter((c) => c.instanceId !== selectedId));
    setSelectedId(null);
    setStep(2);
  }

  function handleSkip() {
    setKeptCardInstanceId("");
    setStep(2);
  }

  function handleSend(destination: "top" | "bottom") {
    onAction({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: keptCardInstanceId ?? "",
      orderedInstanceIds: orderedCards.map((c) => c.instanceId),
      destination,
    });
  }

  const title =
    step === 1
      ? effectDescription
      : `Put the remaining ${orderedCards.length} card${orderedCards.length !== 1 ? "s" : ""} back`;

  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[520px] p-0 gap-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDragEnd}
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-sm font-bold text-gb-text-bright">
            {title}
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onHide}
            className="text-xs text-gb-text-dim hover:text-gb-text hover:bg-gb-surface-raised h-auto px-2 py-1"
          >
            Hide
          </Button>
        </DialogHeader>

        <div className="px-4 py-5">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {orderedCards.map((card, i) => (
              <ModalCard
                key={card.instanceId}
                card={card}
                cardDb={cardDb}
                selected={step === 1 && selectedId === card.instanceId}
                dimmed={step === 1 && !canSelectCard(card.instanceId)}
                isDragOver={dropIndex === i}
                onSelect={() => {
                  if (step === 1 && canSelectCard(card.instanceId)) {
                    setSelectedId((prev) =>
                      prev === card.instanceId ? null : card.instanceId,
                    );
                  }
                }}
                onDragStart={() => handleDragStart(i)}
                onDragOver={() => handleDragOver(i)}
                onDrop={() => handleDrop(i)}
              />
            ))}
          </div>

          {step === 2 && (
            <div className="flex justify-between mt-3">
              <span className="text-xs text-gb-text-dim">← top of deck</span>
              <span className="text-xs text-gb-text-dim">bottom of deck →</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 px-4 py-3 border-t border-gb-border pt-3">
          {step === 1 && (
            <>
              {validTargets !== undefined && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSkip}
                  className="text-xs font-bold bg-gb-surface-raised text-gb-text border-gb-border-strong hover:border-gb-text-muted"
                >
                  Keep None
                </Button>
              )}
              <Button
                size="sm"
                disabled={!selectedId}
                onClick={handleAddToHand}
                className="text-xs font-bold bg-gb-accent-amber/15 text-gb-accent-amber border-gb-accent-amber/30 hover:bg-gb-accent-amber/25 hover:border-gb-accent-amber/60"
              >
                Add to Hand
              </Button>
            </>
          )}
          {step === 2 && (
            <Button
              size="sm"
              onClick={() => handleSend(canSendToBottom ? "bottom" : "top")}
              className="text-xs font-bold bg-gb-accent-amber/15 text-gb-accent-amber border-gb-accent-amber/30 hover:bg-gb-accent-amber/25 hover:border-gb-accent-amber/60"
            >
              {canSendToBottom ? "Place at Bottom" : "Place on Top"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
