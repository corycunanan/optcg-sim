"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardInstance } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { getCardAffordability } from "@/lib/game/client-legality";
import { isCounterEligibleCard } from "@/lib/game/counter-eligibility";
import { Card } from "../card";
import { cardReject, cardRejectReduced, handReflow } from "@/lib/motion";
import { useCardRejection } from "./action-feedback";
import { handSlotZoneKey } from "./board-geometry";
import { FIELD_W, HAND_CARD_W, type HandCardDrag } from "./constants";
import { useInteractionMode } from "./interaction-mode";
import { cn } from "@/lib/utils";

/** How long a just-seen card waits for its flight to register (OPT-1054). */
const ARRIVAL_GRACE_MS = 120;

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
  currentIds: readonly string[]
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
  currentIds: readonly string[]
): ReadonlySet<string> {
  if (prev.size === currentIds.length) {
    let allMatch = true;
    for (const id of currentIds) {
      if (!prev.has(id)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return prev;
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

function SortableHandCard({
  card,
  cardDb,
  disabled,
  dimmed,
  affordable,
  tooltipNotice,
  hidden,
  reducedMotion,
  style,
  enableLayout,
  layoutDep,
  slotRef,
}: {
  card: CardInstance;
  cardDb: CardDb;
  disabled?: boolean;
  dimmed?: boolean;
  affordable?: boolean;
  tooltipNotice?: string;
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
  /** Registers this card's slot so flights land in (and leave from) it. */
  slotRef?: (node: HTMLDivElement | null) => void;
}) {
  const descriptionId = useId();
  const rejectionSequence = useCardRejection(card.instanceId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `hand-${card.instanceId}`,
    data: { type: "hand-card", card, affordable } satisfies HandCardDrag,
    disabled: disabled || hidden,
  });

  const cardState = isDragging ? "dragging" : "active";
  const opacity = isDragging ? 0.3 : dimmed ? 0.35 : 1;
  const rejectionPreset = reducedMotion ? cardRejectReduced : cardReject;
  const cardName = cardDb[card.cardId]?.name ?? card.cardId;
  const rejectionOpacity = rejectionPreset.opacity.map(
    (value, index, values) =>
      index === 0 || index === values.length - 1 ? opacity : value
  );

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
      ref={slotRef}
      layout={enableLayout ? "position" : false}
      layoutDependency={enableLayout ? layoutDep : undefined}
      transition={handReflow}
      style={style}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={hidden ? -1 : attributes.tabIndex}
        aria-label={[
          cardName,
          tooltipNotice,
          disabled && !tooltipNotice
            ? "not available for the current action"
            : null,
        ]
          .filter(Boolean)
          .join(". ")}
        aria-disabled={disabled || dimmed}
        aria-describedby={
          [attributes["aria-describedby"], tooltipNotice ? descriptionId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        style={{
          transform: sortableTransform,
          transition: reducedMotion ? "none" : (transition ?? undefined),
          cursor: disabled || dimmed || hidden ? "default" : "grab",
          visibility: hidden ? "hidden" : undefined,
          touchAction: "none",
        }}
        // Shrink-wraps a fixed-size hand `<Card>`, so the drag focus ring hugs
        // the card and takes the card's corner.
        className="focus-visible:ring-gb-signal-eligible rounded-card focus-visible:ring-4 focus-visible:outline-none"
      >
        <motion.div
          key={rejectionSequence ?? "idle"}
          initial={false}
          animate={
            rejectionSequence
              ? { ...rejectionPreset, opacity: rejectionOpacity }
              : { x: 0, opacity }
          }
          transition={
            rejectionSequence
              ? rejectionPreset.transition
              : { duration: 0.15, ease: "easeOut" }
          }
        >
          <Card
            data={{ card, cardDb }}
            variant="hand"
            state={cardState}
            interaction={
              isDragging
                ? { tooltipDisabled: true }
                : tooltipNotice
                  ? { tooltipNotice }
                  : undefined
            }
          />
          {tooltipNotice && (
            <span id={descriptionId} className="sr-only">
              {tooltipNotice}
            </span>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

export const HandLayer = React.memo(function HandLayer({
  cards,
  cardDb,
  enableDrag,
  counterMode,
  stageCounterGranted,
  availableDon,
  zoneKey,
  inFlightInstanceIds,
  departures,
  sleeveUrl,
}: {
  cards: CardInstance[];
  cardDb: CardDb;
  enableDrag?: boolean;
  counterMode?: boolean;
  /** OPT-1046: a field card gives Stage cards in hand a Counter. */
  stageCounterGranted?: boolean;
  /** Active DON during Main. Undefined outside affordability-signaling mode. */
  availableDon?: number;
  zoneKey?: string;
  /** Set of instanceIds currently in-flight (render as invisible placeholders). */
  inFlightInstanceIds?: Set<string>;
  /** Epoch ms at which each arriving card leaves its source (OPT-1054). */
  departures?: ReadonlyMap<string, number>;
  sleeveUrl?: string | null;
}) {
  const count = cards.length;
  const hasVisibleCards = cards.some((card) => card.cardId !== "hidden");
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion() ?? false;
  const inputSuppressed = useInteractionMode() !== "full";

  // OPT-364: hide cards on their first render in this HandLayer instance so
  // the deck-to-hand flight has a chance to register a transition before the
  // resting card paints on top of it. `seenIds` is held in state (not a ref)
  // so the post-commit reconcile schedules a re-render — without that, the
  // first commit after a perspective flip or a fresh mount would leave every
  // card stuck hidden because nothing else would re-render the layer. Once a
  // card is in `seenIds`, only `inFlightInstanceIds` controls its visibility.
  const cardIds = useMemo(() => cards.map((c) => c.instanceId), [cards]);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(
    () => new Set(cardIds)
  );
  const freshlyAdded = useMemo(
    () => computeFreshlyAdded(seenIds, cardIds),
    [seenIds, cardIds]
  );
  // OPT-1054: a card leaving `freshlyAdded` keeps its slot closed for a short
  // grace window, so the render between the seen-ids reconcile and the
  // transition registering never opens (and paints) the hand's gap early.
  const [awaitingIds, setAwaitingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [graceTimers] = useState(
    () => new Set<ReturnType<typeof setTimeout>>()
  );
  useEffect(() => {
    setSeenIds((prev) => reconcileSeenIds(prev, cardIds));
    if (freshlyAdded.size === 0) return;
    const ids = [...freshlyAdded];
    setAwaitingIds((prev) => new Set([...prev, ...ids]));
    // Not cleared on re-run: `freshlyAdded` empties on the very next render.
    // Pending timers are cleared on unmount (below).
    const timer = setTimeout(() => {
      graceTimers.delete(timer);
      setAwaitingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }, ARRIVAL_GRACE_MS);
    graceTimers.add(timer);
  }, [cardIds, freshlyAdded, graceTimers]);
  useEffect(
    () => () => {
      for (const timer of graceTimers) clearTimeout(timer);
      graceTimers.clear();
    },
    [graceTimers]
  );

  // OPT-1054: an arriving card's slot stays closed (zero width) until its
  // flight departs, so the hand re-fans alongside the flight instead of
  // opening a gap while the card is still flipping on the deck. A card on its
  // first render is held too, until its transition registers. `openIds` maps
  // each arrival whose departure time has passed to that departure, so a card
  // that leaves and comes back (bounce, then redraw) is held again for its
  // new flight instead of reusing the old opening.
  const [openIds, setOpenIds] = useState<ReadonlyMap<string, number>>(
    () => new Map()
  );
  useEffect(() => {
    if (!departures || departures.size === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const [id, departAt] of departures) {
      if (!Number.isFinite(departAt)) continue;
      const wait = Math.max(0, departAt - Date.now());
      timers.push(
        setTimeout(() => {
          setOpenIds((prev) => {
            if (prev.get(id) === departAt) return prev;
            // Drop openings whose flight has ended or been replaced.
            const next = new Map(
              [...prev].filter(
                ([openId, openedFor]) => departures.get(openId) === openedFor
              )
            );
            next.set(id, departAt);
            return next;
          });
        }, wait)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [departures]);
  const heldIds = new Set<string>();
  for (const id of cardIds) {
    if (
      freshlyAdded.has(id) ||
      (awaitingIds.has(id) && departures?.has(id) !== true) ||
      (departures?.has(id) === true &&
        openIds.get(id) !== departures.get(id))
    ) {
      heldIds.add(id);
    }
  }

  const handRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos]
  );

  // OPT-1054: every card registers its own slot so a flight to this hand
  // aims at the card's placeholder (and a play leaves from the card's real
  // place). Ref callbacks are cached per instance so a re-render does not
  // detach and re-measure every slot.
  const [slotRefs] = useState(
    () => new Map<string, (node: HTMLDivElement | null) => void>()
  );
  useEffect(() => {
    if (!zoneKey) return;
    const live = new Set(cardIds.map((id) => handSlotZoneKey(zoneKey, id)));
    for (const key of slotRefs.keys()) {
      if (!live.has(key)) slotRefs.delete(key);
    }
  }, [cardIds, zoneKey, slotRefs]);
  const slotRef = (instanceId: string) => {
    if (!zoneKey) return undefined;
    const key = handSlotZoneKey(zoneKey, instanceId);
    let ref = slotRefs.get(key);
    if (!ref) {
      // The callback stays cached for as long as the card is in the hand:
      // deleting it on detach would hand a remounted slot a new callback
      // every render, churning unregister/register (and a forced measure).
      // Entries for cards that left the hand are pruned below.
      ref = (node: HTMLDivElement | null) => {
        if (node) zonePos.register(key, node);
        else zonePos.unregister(key);
      };
      slotRefs.set(key, ref);
    }
    return ref;
  };

  if (count === 0) return null;

  const maxWidth = FIELD_W - 60;
  // Held slots take no room, so the fan is laid out for the open cards.
  const openCount = count - heldIds.size;
  const totalCardsW = openCount * HAND_CARD_W;
  const rawGap =
    openCount > 1 ? (maxWidth - totalCardsW) / (openCount - 1) : 0;
  const gap = Math.min(12, rawGap);
  // Reflow whenever a card is added, removed, or its slot opens.
  const layoutKey = count * 1000 + heldIds.size;

  const renderCard = (card: CardInstance, i: number) => {
    const held = heldIds.has(card.instanceId);
    const marginStyle = held
      ? { width: 0, minWidth: 0, marginLeft: 0 }
      : i > 0
        ? { marginLeft: gap }
        : undefined;
    // Hide if the transition system says in-flight, or if the card is
    // appearing for the first time on this layer instance (the transition
    // hasn't been registered yet by `useCardTransitions`).
    const isInFlight =
      (inFlightInstanceIds?.has(card.instanceId) ?? false) ||
      freshlyAdded.has(card.instanceId) ||
      held;

    // The server projection is the sole visibility authority. A real cardId
    // renders face-up on either side; the redaction sentinel degrades to a
    // sleeve without relying on viewer identity or board position.
    if (card.cardId === "hidden") {
      return (
        <motion.div
          key={card.instanceId}
          ref={slotRef(card.instanceId)}
          layout={reducedMotion ? false : "position"}
          layoutDependency={reducedMotion ? undefined : layoutKey}
          transition={handReflow}
          style={marginStyle}
          className={cn(held && "invisible")}
        >
          <Card
            data={{ card, cardDb }}
            variant="hand"
            faceDown
            sleeveUrl={sleeveUrl}
          />
        </motion.div>
      );
    }

    if (inputSuppressed) {
      return (
        <motion.div
          key={card.instanceId}
          ref={slotRef(card.instanceId)}
          layout={reducedMotion ? false : "position"}
          layoutDependency={reducedMotion ? undefined : layoutKey}
          transition={handReflow}
          style={marginStyle}
          className={cn(isInFlight && "invisible")}
        >
          <Card data={{ card, cardDb }} variant="hand" />
        </motion.div>
      );
    }

    const eligible = counterMode
      ? isCounterEligibleCard(cardDb[card.cardId], { stageCounterGranted })
      : true;
    const disabled = !enableDrag || (counterMode && !eligible);
    const affordability =
      availableDon === undefined
        ? undefined
        : getCardAffordability(
            cardDb[card.cardId],
            card,
            availableDon
          );
    const unaffordable = affordability?.affordable === false;
    const disabledReason =
      counterMode && !eligible
        ? "This card cannot be used as a counter."
        : affordability?.reason;

    return (
      <SortableHandCard
        key={card.instanceId}
        card={card}
        cardDb={cardDb}
        disabled={disabled}
        dimmed={(counterMode && !eligible) || unaffordable}
        affordable={affordability?.affordable}
        tooltipNotice={disabledReason}
        hidden={isInFlight}
        reducedMotion={reducedMotion}
        style={marginStyle}
        enableLayout={!reducedMotion}
        layoutDep={layoutKey}
        slotRef={slotRef(card.instanceId)}
      />
    );
  };

  // Fully redacted and input-suppressed hands have no reorder interaction.
  // Render them without dnd-kit so spectator cards cannot enter the keyboard
  // tab order as disabled `role="button"` elements.
  if (!hasVisibleCards || inputSuppressed) {
    return (
      <div ref={handRef} className="pointer-events-auto flex items-center">
        {cards.map(renderCard)}
      </div>
    );
  }

  return (
    <div ref={handRef} className="pointer-events-auto flex items-center">
      <SortableContext
        items={cards
          .filter((card) => card.cardId !== "hidden")
          .map((card) => `hand-${card.instanceId}`)}
        strategy={horizontalListSortingStrategy}
      >
        {cards.map(renderCard)}
      </SortableContext>
    </div>
  );
});
