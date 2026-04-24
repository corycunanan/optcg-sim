"use client";

import React, { useCallback, useRef } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardData, CardInstance } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { Card } from "../card";
import { FIELD_W, HAND_CARD_W, type HandCardDrag } from "./constants";

// Migrated onto `<Card variant="hand">` (OPT-268). The primitive owns the
// hand-card hover lift (handCardHover preset), tooltip, and 3D face stack.
// Consumer wrapper keeps: dnd-kit refs, zone registration, drag-origin
// opacity ghost (0.3), counter-mode dim (0.35), in-flight hidden placeholder,
// and the newly-arrived hide-until-transition-registered trick.
//
// OPT-282: draggable hand cards upgraded from `useDraggable` to `useSortable`.
// A `SortableContext` wraps the row so neighbors shift out of the way as a
// card is dragged over them — the drop indicator is the gap itself. Dragging
// a card onto a field zone still plays it (sortable coexists with the board's
// existing droppables).

function isCounterEligible(data: CardData | undefined): boolean {
  if (!data) return false;
  if (data.type === "Character" && data.counter != null && data.counter > 0) return true;
  if (data.type === "Event" && data.effectText?.includes("[Counter]")) return true;
  return false;
}

function SortableHandCard({
  card,
  cardDb,
  disabled,
  dimmed,
  hidden,
  reducedMotion,
  style,
  enableLayout,
  layoutDep,
}: {
  card: CardInstance;
  cardDb: CardDb;
  disabled?: boolean;
  dimmed?: boolean;
  /** When true the card reserves layout space but is invisible (in-flight placeholder). */
  hidden?: boolean;
  reducedMotion: boolean;
  style?: React.CSSProperties;
  /** Enables motion-layout reflow when the hand composition changes (OPT-274).
   *  Disabled during a sortable drag so motion-layout doesn't fight sortable's
   *  `transform` — sortable shifts neighbors via transform which doesn't
   *  change layout box, but the dragged card itself would double-animate. */
  enableLayout: boolean;
  /** Dependency value for motion's layout diffing (OPT-274). Layout measurement
   *  only runs when this changes, scoping reflow to true composition events
   *  (card added/removed/reordered) instead of every render. */
  layoutDep: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `hand-${card.instanceId}`,
    data: { type: "hand-card", card } satisfies HandCardDrag,
    disabled: disabled || hidden,
  });

  const cardState = isDragging ? "dragging" : "active";
  const opacity = isDragging ? 0.3 : dimmed ? 0.35 : 1;

  const sortableTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : undefined;

  // Outer layer owns flex position + motion-layout reflow on hand-composition
  // changes (OPT-274 — card added/removed by draw/play/discard). Inner layer
  // owns the sortable drag/reorder transform + its CSS transition. Separating
  // them keeps motion layout's box-measurement pure (no competing inline
  // transform) while sortable still handles its own drag-follow + drop-back.
  return (
    <motion.div
      layout={enableLayout ? "position" : false}
      layoutDependency={enableLayout ? layoutDep : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      style={style}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{
          transform: sortableTransform,
          transition: reducedMotion ? "none" : (transition ?? undefined),
          cursor: disabled || hidden ? "default" : "grab",
          visibility: hidden ? "hidden" : undefined,
          touchAction: "none",
        }}
      >
        <motion.div
          initial={false}
          animate={{ opacity }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <Card
            data={{ card, cardDb }}
            variant="hand"
            state={cardState}
            interaction={isDragging ? { tooltipDisabled: true } : undefined}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

export const HandLayer = React.memo(function HandLayer({
  cards,
  faceDown,
  cardDb,
  enableDrag,
  counterMode,
  zoneKey,
  inFlightInstanceIds,
  sleeveUrl,
}: {
  cards: CardInstance[];
  faceDown?: boolean;
  cardDb: CardDb;
  enableDrag?: boolean;
  counterMode?: boolean;
  zoneKey?: string;
  /** Set of instanceIds currently in-flight (render as invisible placeholders). */
  inFlightInstanceIds?: Set<string>;
  sleeveUrl?: string | null;
}) {
  const count = cards.length;
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion() ?? false;

  // Track which instanceIds existed in the previous render so we can
  // detect newly-arrived cards and hide them before the transition
  // system catches up (transitions are created in useEffect, one render late).
  // Initialize with null so we can distinguish "first render" from "empty hand".
  const prevIdsRef = useRef<Set<string> | null>(null);
  const currentIds = new Set(cards.map((c) => c.instanceId));
  const newlyArrived = new Set<string>();
  if (prevIdsRef.current !== null) {
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) newlyArrived.add(id);
    }
  }
  prevIdsRef.current = currentIds;

  const handRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos],
  );

  if (count === 0) return null;

  const maxWidth = FIELD_W - 60;
  const totalCardsW = count * HAND_CARD_W;
  const rawGap = count > 1 ? (maxWidth - totalCardsW) / (count - 1) : 0;
  const gap = Math.min(12, rawGap);

  const renderCard = (card: CardInstance, i: number) => {
    const marginStyle = i > 0 ? { marginLeft: gap } : undefined;
    // Hide if the transition system says in-flight, OR if the card just
    // appeared this render (transition hasn't been created yet).
    const isInFlight =
      (inFlightInstanceIds?.has(card.instanceId) ?? false) ||
      newlyArrived.has(card.instanceId);

    if (faceDown) {
      return (
        <Card
          key={card.instanceId}
          data={{ card, cardDb }}
          variant="hand"
          faceDown
          sleeveUrl={sleeveUrl}
          style={marginStyle}
        />
      );
    }

    const eligible = counterMode
      ? isCounterEligible(cardDb[card.cardId])
      : true;
    const disabled = !enableDrag || (counterMode && !eligible);

    return (
      <SortableHandCard
        key={card.instanceId}
        card={card}
        cardDb={cardDb}
        disabled={disabled}
        dimmed={counterMode && !eligible}
        hidden={isInFlight}
        reducedMotion={reducedMotion}
        style={marginStyle}
        enableLayout={!reducedMotion}
        layoutDep={count}
      />
    );
  };

  // Opponent (face-down) hand has no reorder interaction — render without
  // SortableContext. Player hand wraps in SortableContext so neighbors shift
  // when a card is dragged over them.
  if (faceDown) {
    return (
      <div ref={handRef} className="flex items-center pointer-events-auto">
        {cards.map(renderCard)}
      </div>
    );
  }

  return (
    <div ref={handRef} className="flex items-center pointer-events-auto">
      <SortableContext
        items={cards.map((c) => `hand-${c.instanceId}`)}
        strategy={horizontalListSortingStrategy}
      >
        {cards.map(renderCard)}
      </SortableContext>
    </div>
  );
});
