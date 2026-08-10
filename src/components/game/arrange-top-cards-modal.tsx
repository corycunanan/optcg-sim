"use client";

import React, { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragCancelEvent,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
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
import { getPortalContainer } from "./scaled-board";
import { GameButton } from "./game-button";
import { Card } from "./card";
import { useRovingFocus } from "@/hooks/use-roving-focus";

const arrangeScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "While choosing, press Enter or Space to select a card. In the reorder step, press Enter or Space to pick up a card. Use the arrow keys to move it, press Enter or Space to drop, or Escape to cancel.",
};

export function getArrangeEscapeAction(
  activeId: string | null,
  selectedId: string | null,
  step: 1 | 2,
): "cancel-drag" | "clear-selection" | "hide" {
  if (activeId) return "cancel-drag";
  if (step === 1 && selectedId) return "clear-selection";
  return "hide";
}

export function getArrangeDestinations(
  restDestination: string | undefined,
  canSendToBottom: boolean,
): ("top" | "bottom")[] {
  if (restDestination?.toUpperCase() === "TOP_OR_BOTTOM") {
    return ["bottom", "top"];
  }
  return [canSendToBottom ? "bottom" : "top"];
}

function SortableModalCard({
  card,
  cardDb,
  selected,
  disabledReason,
  selectable,
  reducedMotion,
  onSelect,
  rovingTabIndex,
  onRovingFocus,
  onRovingKeyDown,
  setRovingRef,
}: {
  card: CardInstance;
  cardDb: CardDb;
  selected?: boolean;
  disabledReason?: string;
  selectable: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  rovingTabIndex: number;
  onRovingFocus: () => void;
  onRovingKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  setRovingRef: (node: HTMLButtonElement | null) => void;
}) {
  const descriptionId = useId();
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
  const dimmed = !!disabledReason;

  const mergedRef = (node: HTMLButtonElement | null) => {
    setNodeRef(node);
    setRovingRef(node);
  };

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onRovingKeyDown(event);
    if (event.defaultPrevented) return;
    if (selectable && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (!dimmed) onSelect();
      return;
    }
    listeners?.onKeyDown?.(event);
  }

  return (
    <button
      type="button"
      ref={mergedRef}
      {...attributes}
      {...listeners}
      tabIndex={rovingTabIndex}
      aria-label={cardDb[card.cardId]?.name ?? card.cardId}
      aria-pressed={selectable ? !!selected : attributes["aria-pressed"]}
      aria-disabled={selectable && dimmed}
      aria-describedby={
        [attributes["aria-describedby"], dimmed ? descriptionId : null]
          .filter(Boolean)
          .join(" ")
      }
      onFocus={onRovingFocus}
      onKeyDown={handleKeyDown}
      onClick={() => {
        if (selectable && !dimmed) onSelect();
      }}
      style={{
        transform: sortableTransform,
        transition: reducedMotion ? "none" : (transition ?? undefined),
        opacity: isDragging ? 0.3 : undefined,
      }}
      className={cn(
        "relative shrink-0 touch-none select-none rounded border-0 bg-transparent p-0 text-left cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gb-signal-eligible",
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
      {dimmed && (
        <span id={descriptionId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </button>
  );
}

interface ArrangeTopCardsModalProps {
  cards: CardInstance[];
  effectDescription: string;
  canSendToBottom: boolean;
  restDestination?: string;
  /** If provided, only these instanceIds may be selected to add to hand */
  validTargets?: string[];
  /** How many cards may be kept ("up to N"). Defaults to 1. */
  maxKeep?: number;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function ArrangeTopCardsModal({
  cards: initialCards,
  effectDescription,
  canSendToBottom,
  restDestination,
  validTargets,
  maxKeep = 1,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: ArrangeTopCardsModalProps) {
  // maxKeep 0 = pure reorder (OPT-371 cost arrangement) — no pick step.
  const [step, setStep] = useState<1 | 2>(maxKeep === 0 ? 2 : 1);
  const [orderedCards, setOrderedCards] = useState<CardInstance[]>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keptIds, setKeptIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reducedMotion = useReducedMotion() ?? false;
  const destinations = getArrangeDestinations(restDestination, canSendToBottom);
  const dragTilt = useDragTilt({ disabled: reducedMotion });
  const rovingFocus = useRovingFocus<HTMLButtonElement>(
    orderedCards.map((card) => card.instanceId),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements = useMemo<Announcements>(() => {
    const labelFor = (id: string | number) => {
      const card = orderedCards.find((item) => item.instanceId === String(id));
      return card ? cardDb[card.cardId]?.name ?? card.cardId : "card";
    };
    return {
      onDragStart: ({ active }) => `${labelFor(active.id)} picked up.`,
      onDragOver: ({ active, over }) =>
        over
          ? `${labelFor(active.id)} moved to ${labelFor(over.id)}.`
          : `${labelFor(active.id)} is not over a card position.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `${labelFor(active.id)} dropped at ${labelFor(over.id)}.`
          : `${labelFor(active.id)} was not moved.`,
      onDragCancel: ({ active }) => `${labelFor(active.id)} drag canceled.`,
    };
  }, [cardDb, orderedCards]);

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

  function handleDragCancel(event: DragCancelEvent) {
    dragTilt.handleDragEnd(event);
    setActiveId(null);
  }

  function handleAddToHand() {
    if (!selectedId) return;
    const next = [...keptIds, selectedId];
    setKeptIds(next);
    setOrderedCards((prev) => prev.filter((c) => c.instanceId !== selectedId));
    setSelectedId(null);
    if (next.length >= maxKeep) setStep(2);
  }

  function handleSkip() {
    setSelectedId(null);
    setStep(2);
  }

  function handleSend(destination: "top" | "bottom") {
    onAction({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: keptIds[0] ?? "",
      keptCardInstanceIds: keptIds,
      orderedInstanceIds: orderedCards.map((c) => c.instanceId),
      destination,
    });
  }

  const title =
    step === 1 || maxKeep === 0
      ? effectDescription
      : `Put the remaining ${orderedCards.length} card${orderedCards.length !== 1 ? "s" : ""} back`;

  const activeCard = activeId
    ? orderedCards.find((c) => c.instanceId === activeId) ?? null
    : null;

  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          const action = getArrangeEscapeAction(activeId, selectedId, step);
          if (action === "hide") return;
          event.preventDefault();
          if (action === "clear-selection") setSelectedId(null);
        }}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[520px] p-0 gap-0"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-gb-text-bright">
            {title}
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <TooltipProvider delayDuration={0} disableHoverableContent>
          <DndContext
            sensors={sensors}
            accessibility={{
              announcements,
              screenReaderInstructions: arrangeScreenReaderInstructions,
            }}
            onDragStart={handleDragStart}
            onDragMove={dragTilt.handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
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
                      disabledReason={
                        step === 1 && !canSelectCard(card.instanceId)
                          ? "This card cannot be chosen for this effect."
                          : undefined
                      }
                      selectable={step === 1}
                      reducedMotion={reducedMotion}
                      rovingTabIndex={rovingFocus.getTabIndex(card.instanceId)}
                      onRovingFocus={() => rovingFocus.onFocus(card.instanceId)}
                      onRovingKeyDown={(event) =>
                        rovingFocus.onKeyDown(event, card.instanceId)
                      }
                      setRovingRef={(node) =>
                        rovingFocus.setItemRef(card.instanceId, node)
                      }
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

            {/* Portal the overlay outside Radix Dialog's translate(-50%,-50%)
                wrapper so DragOverlay's position:fixed tracking isn't broken by
                a transformed ancestor. Targets `<PortalRoot>` when shells mount
                it (OPT-309/317); falls back to body until then. React context is
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
                getPortalContainer() ?? document.body,
              )}
          </DndContext>
        </TooltipProvider>

        <DialogFooter className="flex-row items-center justify-end gap-2 px-4 py-3 border-t border-gb-border pt-3">
          {step === 1 && (
            <>
              {(validTargets !== undefined || maxKeep > 1) && (
                <GameButton variant="secondary" size="sm" onClick={handleSkip}>
                  {keptIds.length > 0 ? "Done" : "Keep None"}
                </GameButton>
              )}
              <GameButton
                variant="amber"
                size="sm"
                disabled={!selectedId}
                onClick={handleAddToHand}
              >
                {maxKeep > 1 ? `Take (${keptIds.length}/${maxKeep})` : "Add to Hand"}
              </GameButton>
            </>
          )}
          {step === 2 &&
            destinations.map((destination) => (
              <GameButton
                key={destination}
                variant="amber"
                size="sm"
                onClick={() => handleSend(destination)}
              >
                {destination === "bottom" ? "Place at Bottom" : "Place on Top"}
              </GameButton>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
