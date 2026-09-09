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
import type {
  CardDb,
  CardInstance,
  GameAction,
  PromptSourceCard,
} from "@shared/game-types";
import { useDragTilt } from "@/hooks/use-drag-tilt";
import { cn } from "@/lib/utils";
import { getPortalContainer } from "./scaled-board";
import { GameButton } from "./game-button";
import { Card } from "./card";
import { EffectPromptDialog } from "./effect-prompt-dialog";
import { useRovingFocus } from "@/hooks/use-roving-focus";

const arrangeScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "While choosing, press Enter or Space to select a card. In the reorder step, press Enter or Space to pick up a card. Use the arrow keys to move it, press Enter or Space to drop, or Escape to cancel.",
};

export function getArrangeEscapeAction(
  activeId: string | null,
  selectedId: string | null,
  step: 1 | 2
): "cancel-drag" | "clear-selection" | "hide" {
  if (activeId) return "cancel-drag";
  if (step === 1 && selectedId) return "clear-selection";
  return "hide";
}

export function getArrangeDestinations(
  restDestination: string | undefined,
  canSendToBottom: boolean
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
      aria-describedby={[
        attributes["aria-describedby"],
        dimmed ? descriptionId : null,
      ]
        .filter(Boolean)
        .join(" ")}
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
        // Zero padding and border around a fixed-size `<Card>`, so the drag and
        // selection rings trace the card's own outline.
        "rounded-card focus-visible:ring-gb-signal-eligible relative shrink-0 cursor-grab touch-none border-0 bg-transparent p-0 text-left select-none focus-visible:ring-2 focus-visible:outline-none",
        selected &&
          "ring-gb-accent-amber ring-2 ring-offset-1 ring-offset-transparent",
        dimmed && "opacity-40"
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
        <div className="bg-gb-accent-amber absolute top-1 right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5l2 2 4-4"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
  sourceCard?: PromptSourceCard;
  canSendToBottom: boolean;
  restDestination?: string;
  /** If provided, only these instanceIds may be picked in the choose step. */
  validTargets?: string[];
  /** How many cards may be kept ("up to N"). Defaults to 1. 0 = reorder only. */
  maxKeep?: number;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

/**
 * Two steps behind one frame. Step 1 picks up to `maxKeep` cards from the
 * revealed row; Step 2 orders whatever remains and chooses where it goes. The
 * effect's own text (in the description) says what happens to the picks, so
 * the footer stays Skip / Confirm.
 */
export function ArrangeTopCardsModal({
  cards: initialCards,
  effectDescription,
  sourceCard,
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
  const [orderedCards, setOrderedCards] =
    useState<CardInstance[]>(initialCards);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [keptIds, setKeptIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reducedMotion = useReducedMotion() ?? false;
  const destinations = getArrangeDestinations(restDestination, canSendToBottom);
  const [destination, setDestination] = useState<"top" | "bottom" | null>(
    destinations.length === 1 ? destinations[0] : null
  );
  const dragTilt = useDragTilt({ disabled: reducedMotion });
  const rovingFocus = useRovingFocus<HTMLButtonElement>(
    orderedCards.map((card) => card.instanceId)
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const announcements = useMemo<Announcements>(() => {
    const labelFor = (id: string | number) => {
      const card = orderedCards.find((item) => item.instanceId === String(id));
      return card ? (cardDb[card.cardId]?.name ?? card.cardId) : "card";
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

  // If validTargets is provided, only those cards can be picked.
  const canSelectCard = (instanceId: string) =>
    validTargets === undefined || validTargets.includes(instanceId);
  // "Up to N" effects may keep nothing; an exact single pick may not.
  const canKeepNone = validTargets !== undefined || maxKeep > 1;

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

  function toggleSelected(instanceId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) next.delete(instanceId);
      else if (next.size < maxKeep) next.add(instanceId);
      return next;
    });
  }

  function submit(
    kept: string[],
    remaining: CardInstance[],
    sendTo: "top" | "bottom"
  ) {
    onAction({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: kept[0] ?? "",
      keptCardInstanceIds: kept,
      orderedInstanceIds: remaining.map((c) => c.instanceId),
      destination: sendTo,
    });
  }

  function advanceToArrange(kept: string[]) {
    const remaining = orderedCards.filter((c) => !kept.includes(c.instanceId));
    setKeptIds(kept);
    setSelectedIds(new Set());
    // Nothing left to order: the only remaining decision is already fixed.
    if (remaining.length === 0 && destinations.length === 1) {
      submit(kept, remaining, destinations[0]);
      return;
    }
    setOrderedCards(remaining);
    setStep(2);
  }

  function handleConfirm() {
    if (step === 1) {
      if (selectedIds.size === 0) return;
      advanceToArrange(
        orderedCards
          .filter((c) => selectedIds.has(c.instanceId))
          .map((c) => c.instanceId)
      );
      return;
    }
    if (!destination) return;
    submit(keptIds, orderedCards, destination);
  }

  const handleSkip =
    step === 1 && canKeepNone ? () => advanceToArrange([]) : undefined;

  const firstSelectedId = selectedIds.values().next().value ?? null;
  const confirmDisabled =
    step === 1 ? selectedIds.size === 0 : destination === null;
  const remainingLabel = `${orderedCards.length} card${orderedCards.length !== 1 ? "s" : ""}`;

  const activeCard = activeId
    ? (orderedCards.find((c) => c.instanceId === activeId) ?? null)
    : null;

  return (
    <EffectPromptDialog
      effectDescription={effectDescription}
      sourceCard={sourceCard}
      cardDb={cardDb}
      isHidden={isHidden}
      onHide={onHide}
      onConfirm={handleConfirm}
      confirmDisabled={confirmDisabled}
      onSkip={handleSkip}
      onEscapeKeyDown={(event) => {
        const action = getArrangeEscapeAction(activeId, firstSelectedId, step);
        if (action === "hide") return;
        event.preventDefault();
        if (action === "clear-selection") setSelectedIds(new Set());
      }}
      status={
        step === 1
          ? `${selectedIds.size} of ${maxKeep} selected`
          : `Order the remaining ${remainingLabel}`
      }
    >
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
        <div className="py-1">
          <SortableContext
            items={orderedCards.map((c) => c.instanceId)}
            strategy={rectSortingStrategy}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              {orderedCards.map((card) => (
                <SortableModalCard
                  key={card.instanceId}
                  card={card}
                  cardDb={cardDb}
                  selected={step === 1 && selectedIds.has(card.instanceId)}
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
                      toggleSelected(card.instanceId);
                    }
                  }}
                />
              ))}
            </div>
          </SortableContext>

          {step === 2 && (
            <div className="text-gb-text-dim mt-4 flex items-center justify-between text-sm">
              <span aria-hidden="true">&larr; top of deck</span>
              <span aria-hidden="true">bottom of deck &rarr;</span>
            </div>
          )}

          {step === 2 && destinations.length > 1 && (
            <div
              role="group"
              aria-label="Where to place the remaining cards"
              className="mt-4 flex items-center justify-center gap-2"
            >
              {destinations.map((option) => (
                <GameButton
                  key={option}
                  variant={destination === option ? "amber" : "secondary"}
                  size="sm"
                  aria-pressed={destination === option}
                  onClick={() => setDestination(option)}
                >
                  {option === "bottom" ? "Bottom of deck" : "Top of deck"}
                </GameButton>
              ))}
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
                    data={{
                      card: activeCard,
                      cardId: activeCard.cardId,
                      cardDb,
                    }}
                    interaction={{ tooltipDisabled: true }}
                  />
                </motion.div>
              )}
            </DragOverlay>,
            getPortalContainer() ?? document.body
          )}
      </DndContext>
    </EffectPromptDialog>
  );
}
