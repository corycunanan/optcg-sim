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
  TooltipProvider,
} from "@/components/ui";
import { GameButton } from "./game-button";
import { Card } from "./card";

// The `<Card>` primitive renders inside a 3D DOM tree (perspective + preserve-3d
// + backface-visibility + inline rotateX/rotateY motion values). The browser's
// HTML5 drag-image snapshot of that tree shows the back face or a black box.
// Swap in a flat `<img>` clone of the card art so the snapshot bypasses the
// 3D context entirely.
function setFlatCardDragImage(
  e: React.DragEvent<HTMLDivElement>,
  imageUrl: string,
) {
  const rect = e.currentTarget.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  const ghost = document.createElement("img");
  ghost.src = imageUrl;
  ghost.alt = "";
  ghost.draggable = false;
  ghost.style.position = "fixed";
  ghost.style.top = "-10000px";
  ghost.style.left = "-10000px";
  ghost.style.width = "80px";
  ghost.style.height = "112px";
  ghost.style.borderRadius = "4px";
  ghost.style.objectFit = "cover";
  ghost.style.pointerEvents = "none";
  document.body.appendChild(ghost);

  e.dataTransfer.setDragImage(ghost, offsetX, offsetY);

  // The browser snapshots synchronously, but the element must stay in the DOM
  // until the next frame or Safari drops the bitmap.
  requestAnimationFrame(() => ghost.remove());
}

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
  const imageUrl = cardDb[card.cardId]?.imageUrl ?? null;

  return (
    <div
      draggable
      onClick={onSelect}
      onDragStart={(e) => {
        e.stopPropagation();
        if (imageUrl) setFlatCardDragImage(e, imageUrl);
        onDragStart();
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      className={cn(
        "relative rounded select-none shrink-0 cursor-grab transition-[box-shadow] duration-150",
        selected && "ring-2 ring-gb-accent-amber ring-offset-1 ring-offset-transparent",
        isDragOver && !selected && "ring-2 ring-gb-accent-blue",
        dimmed && "opacity-40",
      )}
    >
      <Card
        variant="modal"
        size="field"
        data={{ card, cardId: card.cardId, cardDb }}
      />
      {selected && (
        <div className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-gb-accent-amber flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
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
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
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
        </TooltipProvider>

        <DialogFooter className="flex-row items-center justify-end gap-2 px-4 py-3 border-t border-gb-border pt-3">
          {step === 1 && (
            <>
              {validTargets !== undefined && (
                <GameButton variant="secondary" size="sm" onClick={handleSkip}>
                  Keep None
                </GameButton>
              )}
              <GameButton
                variant="amber"
                size="sm"
                disabled={!selectedId}
                onClick={handleAddToHand}
              >
                Add to Hand
              </GameButton>
            </>
          )}
          {step === 2 && (
            <GameButton
              variant="amber"
              size="sm"
              onClick={() => handleSend(canSendToBottom ? "bottom" : "top")}
            >
              {canSendToBottom ? "Place at Bottom" : "Place on Top"}
            </GameButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
