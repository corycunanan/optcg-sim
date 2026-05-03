"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * OPT-364: returns instanceIds present in `currentIds` that were not in
 * `seenIds`. Pure so the hide-on-first-render behavior in `HandLayer` can be
 * unit-tested without rendering React.
 *
 * The previous helper (`useFieldArrivals`) cached arrivals across renders and
 * only cleared them when the id list mutated again — leaving the drawn card
 * hidden indefinitely whenever the hand didn't change between draws (e.g.,
 * solitaire end-main → next-side draw with an empty hand).
 */
export function computeFreshlyAdded(
  seenIds: ReadonlySet<string>,
  currentIds: readonly string[],
): Set<string> {
  const fresh = new Set<string>();
  for (const id of currentIds) {
    if (!seenIds.has(id)) fresh.add(id);
  }
  return fresh;
}

/**
 * OPT-364: post-commit reconcile for the seen-ids set. Returns the same `prev`
 * reference when `currentIds` already matches it (so React's setState bails
 * out of an extra render), otherwise returns a fresh set containing exactly
 * the `currentIds`. Drives the convergence: render N marks new ids as
 * `freshlyAdded`, the post-commit reconcile updates state, render N+1 sees
 * them as already-seen and reveals them.
 */
export function reconcileSeenIds(
  prev: ReadonlySet<string>,
  currentIds: readonly string[],
): Set<string> {
  if (prev.size === currentIds.length) {
    let allMatch = true;
    for (const id of currentIds) {
      if (!prev.has(id)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return prev as Set<string>;
  }
  return new Set(currentIds);
}

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

  // OPT-364: hide cards on their first render in this HandLayer instance so
  // the deck-to-hand flight has a chance to register a transition before the
  // resting card paints on top of it. `seenIds` is held in state (not a ref)
  // so the post-commit reconcile schedules a re-render — without that, the
  // first commit after a perspective flip or a fresh mount would leave every
  // card stuck hidden because nothing else would re-render the layer. Once a
  // card is in `seenIds`, only `inFlightInstanceIds` controls its visibility.
  const cardIds = useMemo(() => cards.map((c) => c.instanceId), [cards]);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(
    () => new Set(cardIds),
  );
  const freshlyAdded = useMemo(
    () => computeFreshlyAdded(seenIds, cardIds),
    [seenIds, cardIds],
  );
  useEffect(() => {
    setSeenIds((prev) => reconcileSeenIds(prev, cardIds));
  }, [cardIds]);

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
    // Hide if the transition system says in-flight, or if the card is
    // appearing for the first time on this layer instance (the transition
    // hasn't been registered yet by `useCardTransitions`).
    const isInFlight =
      (inFlightInstanceIds?.has(card.instanceId) ?? false) ||
      freshlyAdded.has(card.instanceId);

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
