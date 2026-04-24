"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { useDragTilt } from "@/hooks/use-drag-tilt";
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

function SortableModalCard({
  card,
  cardDb,
  selected,
  dimmed,
  reducedMotion,
  onSelect,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selected?: boolean;
  dimmed?: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.instanceId });

  const sortableTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      style={{
        transform: sortableTransform,
        transition: reducedMotion ? "none" : (transition ?? undefined),
        opacity: isDragging ? 0.3 : undefined,
      }}
      className={cn(
        "relative rounded select-none shrink-0 cursor-grab touch-none",
        selected && "ring-2 ring-gb-accent-amber ring-offset-1 ring-offset-transparent",
        dimmed && "opacity-40",
      )}
    >
      <Card
        variant="modal"
        size="field"
        data={{ card, cardId: card.cardId, cardDb }}
        state={isDragging ? "dragging" : undefined}
        interaction={isDragging ? { tooltipDisabled: true } : undefined}
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
  const [activeId, setActiveId] = useState<string | null>(null);

  const reducedMotion = useReducedMotion() ?? false;
  const dragTilt = useDragTilt({ disabled: reducedMotion });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // If validTargets is provided, only those cards can be selected
  const canSelectCard = (instanceId: string) =>
    validTargets === undefined || validTargets.includes(instanceId);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    dragTilt.handleDragStart(event);
  }

  function handleDragEnd(event: DragEndEvent) {
    dragTilt.handleDragEnd(event);
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedCards((prev) => {
        const oldIndex = prev.findIndex((c) => c.instanceId === active.id);
        const newIndex = prev.findIndex((c) => c.instanceId === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
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

  const activeCard = activeId
    ? orderedCards.find((c) => c.instanceId === activeId) ?? null
    : null;

  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[520px] p-0 gap-0"
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
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragMove={dragTilt.handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              dragTilt.handleDragEnd({} as DragEndEvent);
              setActiveId(null);
            }}
          >
            <div className="px-4 py-5">
              <SortableContext
                items={orderedCards.map((c) => c.instanceId)}
                strategy={rectSortingStrategy}
              >
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {orderedCards.map((card) => (
                    <SortableModalCard
                      key={card.instanceId}
                      card={card}
                      cardDb={cardDb}
                      selected={step === 1 && selectedId === card.instanceId}
                      dimmed={step === 1 && !canSelectCard(card.instanceId)}
                      reducedMotion={reducedMotion}
                      onSelect={() => {
                        if (step === 1 && canSelectCard(card.instanceId)) {
                          setSelectedId((prev) =>
                            prev === card.instanceId ? null : card.instanceId,
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              </SortableContext>

              {step === 2 && (
                <div className="flex justify-between mt-3">
                  <span className="text-xs text-gb-text-dim">← top of deck</span>
                  <span className="text-xs text-gb-text-dim">bottom of deck →</span>
                </div>
              )}
            </div>

            {/* Portal the overlay to document.body so Radix Dialog's
                translate(-50%,-50%) centering transform doesn't break
                DragOverlay's position:fixed tracking. React context is
                preserved through portals, so DndContext still sees it. */}
            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay dropAnimation={null}>
                  {activeCard && (
                    <motion.div
                      style={{
                        transformPerspective: 1000,
                        rotateX: dragTilt.tiltX,
                        rotateY: dragTilt.tiltY,
                      }}
                    >
                      <Card
                        variant="modal"
                        size="field"
                        data={{ card: activeCard, cardId: activeCard.cardId, cardDb }}
                        interaction={{ tooltipDisabled: true }}
                      />
                    </motion.div>
                  )}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
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
