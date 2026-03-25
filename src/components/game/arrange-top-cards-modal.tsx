"use client";

import React, { useState } from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useCardTooltip } from "./use-card-tooltip";

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
  const { triggerRef, hoverHandlers, portal } = useCardTooltip(data, card.cardId, card);

  return (
    <>
      <div
        ref={triggerRef}
        draggable
        onClick={onSelect}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
        {...hoverHandlers}
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
      {portal}
    </>
  );
}

function ModalBtn({
  children,
  onClick,
  disabled,
  accent,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-2 text-xs font-bold rounded-md border transition-colors cursor-pointer",
        accent
          ? "bg-gb-accent-amber/15 text-gb-accent-amber border-gb-accent-amber/30 hover:border-gb-accent-amber/60"
          : "bg-gb-surface-raised text-gb-text border-gb-border-strong hover:border-gb-text-muted",
        disabled && "opacity-40 cursor-not-allowed pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

interface ArrangeTopCardsModalProps {
  cards: CardInstance[];
  effectDescription: string;
  canSendToBottom: boolean;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function ArrangeTopCardsModal({
  cards: initialCards,
  effectDescription,
  canSendToBottom,
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

  if (isHidden) return null;

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

  function handleSend(destination: "top" | "bottom") {
    if (!keptCardInstanceId) return;
    onAction({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId,
      orderedInstanceIds: orderedCards.map((c) => c.instanceId),
      destination,
    });
  }

  const title =
    step === 1
      ? effectDescription
      : `Put the remaining ${orderedCards.length} card${orderedCards.length !== 1 ? "s" : ""} back`;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-gb-surface border border-gb-border-strong rounded-lg flex flex-col"
        style={{ width: 520, maxWidth: "calc(100vw - 32px)" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDragEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gb-border">
          <span className="text-sm font-bold text-gb-text-bright">{title}</span>
          <button
            onClick={onHide}
            className="text-xs text-gb-text-dim hover:text-gb-text px-2 py-1 rounded-md hover:bg-gb-surface-raised transition-colors cursor-pointer"
          >
            Hide
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-5">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {orderedCards.map((card, i) => (
              <ModalCard
                key={card.instanceId}
                card={card}
                cardDb={cardDb}
                selected={step === 1 && selectedId === card.instanceId}
                dimmed={dragIndex !== null && dragIndex === i}
                isDragOver={dropIndex === i}
                onSelect={() => {
                  if (step === 1) {
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gb-border">
          {step === 1 && (
            <ModalBtn accent disabled={!selectedId} onClick={handleAddToHand}>
              Add Card to Hand
            </ModalBtn>
          )}
          {step === 2 && (
            <>
              {canSendToBottom && (
                <ModalBtn onClick={() => handleSend("bottom")}>
                  Send to Bottom
                </ModalBtn>
              )}
              <ModalBtn accent onClick={() => handleSend("top")}>
                Send to Top
              </ModalBtn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
