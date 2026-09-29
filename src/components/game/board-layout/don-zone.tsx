"use client";

import React, { useCallback, useId } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { cn } from "@/lib/utils";
import type { TargetCardSelectionState } from "@/lib/game/target-selection";
import { useZonePosition } from "@/contexts/zone-position-context";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import { cardEntry } from "@/lib/motion";
import { Card } from "../card";
import { getBoardZoneLabel } from "./accessibility";
import { type ActiveDonDrag } from "./constants";
import { stgDonWidth } from "./board-geometry";

const DON_CARD_W = 50;
const DON_CARD_H = 70;
const DON_ACTIVE_OVERLAP = 35;
const DON_RESTED_OVERLAP = 60;
const DEFAULT_DON_IMG = "/images/DON/zoro.jpg";
export const DON_ENTRY_STAGGER_SECONDS = 0.05;

// ─── Prompt-time fan-out (OPT-792) ───────────────────────────────────────────
// At rest, DON!! overlap heavily: each covered token shows 15 board px
// (active) or 10 (rested) — a few screen px once the board scales down. While
// an in-place SELECT_TARGET offers DON!! from this zone, the offered group
// fans out to use the zone width (the other group compresses), clamped so a
// full 10 DON!! still fit. Steps never drop below the resting ones.
const DON_ZONE_BORDER = 2;
const DON_GROUP_GAP = 8;
const DON_FAN_CARD_GAP = 4;
const DON_MIN_STEP = 4;
const DON_ACTIVE_STEP = DON_CARD_W - DON_ACTIVE_OVERLAP;
const DON_RESTED_STEP = DON_CARD_H - DON_RESTED_OVERLAP;

export interface DonFanSteps {
  /** Horizontal distance between consecutive active DON!! (board px). */
  active: number;
  /** Horizontal distance between consecutive rested DON!! (board px). */
  rested: number;
}

export function donFanSteps({
  activeCount,
  restedCount,
  activeOffered,
  restedOffered,
  zoneWidth,
}: {
  activeCount: number;
  restedCount: number;
  activeOffered: boolean;
  restedOffered: boolean;
  zoneWidth: number;
}): DonFanSteps {
  const resting = { active: DON_ACTIVE_STEP, rested: DON_RESTED_STEP };
  if (!activeOffered && !restedOffered) return resting;

  const groups = [
    { key: "active" as const, n: activeCount, card: DON_CARD_W, offered: activeOffered },
    { key: "rested" as const, n: restedCount, card: DON_CARD_H, offered: restedOffered },
  ].filter((group) => group.n > 0);
  const gap = groups.length > 1 ? DON_GROUP_GAP : 0;
  let available = zoneWidth - DON_ZONE_BORDER - gap;
  const steps: DonFanSteps = { ...resting };

  // Other group: compressed so the offered group gets the room.
  for (const group of groups.filter((g) => !g.offered)) {
    steps[group.key] = DON_MIN_STEP;
    available -= group.card + (group.n - 1) * DON_MIN_STEP;
  }
  // Offered groups share the remaining room; fitting always wins.
  const offered = groups.filter((g) => g.offered);
  available -= offered.reduce((sum, g) => sum + g.card, 0);
  const cap = (g: (typeof groups)[number], step: number) =>
    Math.min(g.card + DON_FAN_CARD_GAP, step);
  const spans = offered.reduce((sum, g) => sum + (g.n - 1), 0);
  if (spans === 0) {
    for (const g of offered) steps[g.key] = cap(g, Infinity);
    return steps;
  }
  const share = Math.floor(available / spans);
  const [first, second] = offered;
  if (second && first.n > 1 && second.n > 1) {
    // Both groups offered: if one falls below its resting step, pin it there
    // when the other can still keep its own resting step.
    for (const [low, high] of [
      [first, second],
      [second, first],
    ] as const) {
      if (share >= resting[low.key]) continue;
      const rest = Math.floor(
        (available - (low.n - 1) * resting[low.key]) / (high.n - 1),
      );
      if (rest >= resting[high.key]) {
        steps[low.key] = resting[low.key];
        steps[high.key] = cap(high, rest);
        return steps;
      }
    }
  }
  for (const g of offered) steps[g.key] = cap(g, share);
  return steps;
}

// DON entry pop on turn-start (OPT-121). New tokens scale + fade in; existing
// tokens skip the pop via `initial={false}`. Same shape as field-card entry
// so the cue reads consistently across the board.
const ENTRY_INITIAL = { scale: 0.9, opacity: 0, y: 4 } as const;
const ENTRY_ANIMATE = { scale: 1, opacity: 1, y: 0 } as const;

function entryTransition(index: number) {
  return { ...cardEntry, delay: index * DON_ENTRY_STAGGER_SECONDS };
}

export const DonCard = React.memo(function DonCard({
  rested,
  donArtUrl,
}: {
  rested?: boolean;
  donArtUrl?: string | null;
}) {
  return (
    <Card
      variant="don"
      state={rested ? "rest" : "active"}
      artUrl={donArtUrl || DEFAULT_DON_IMG}
    />
  );
});

function DraggableDonCard({
  don,
  index,
  step,
  disabled,
  donArtUrl,
  motionDelay,
  entering,
  entryIndex,
}: {
  don: DonInstance;
  index: number;
  step: number;
  disabled?: boolean;
  donArtUrl?: string | null;
  motionDelay?: number;
  /** Plays the entry pop on mount (OPT-121). Set by `DonZone` for tokens
   *  that weren't in the previous render — typically the freshly-added DON
   *  at turn start. */
  entering?: boolean;
  entryIndex: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `don-${don.instanceId}`,
    data: { type: "active-don", don } satisfies ActiveDonDrag,
    disabled,
  });

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={isDragging ? "Active DON!!, dragging" : "Active DON!!, draggable"}
      data-don-instance-id={don.instanceId}
      initial={entering ? ENTRY_INITIAL : false}
      animate={{ ...ENTRY_ANIMATE, opacity: isDragging ? 0.3 : 1 }}
      transition={entering ? entryTransition(entryIndex) : undefined}
      style={{
        marginLeft: index > 0 ? step - DON_CARD_W : 0,
        zIndex: index,
        cursor: disabled ? "default" : "grab",
      }}
      // Shrink-wraps the DON token `<Card>`, so the drag focus ring traces that
      // card's outline rather than a chrome corner.
      className="touch-none rounded-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gb-signal-eligible"
    >
      <Card
        variant="don"
        state={isDragging ? "dragging" : "active"}
        artUrl={donArtUrl || DEFAULT_DON_IMG}
        motionDelay={motionDelay}
      />
    </motion.div>
  );
}

/**
 * OPT-792: a cost-area DON!! offered by an in-place SELECT_TARGET prompt
 * (mixed "Characters or DON!!" pools). Mirrors the field-card selection
 * affordance: eligible/selected highlight ring, click and Enter/Space toggle,
 * dimmed and inert when ineligible, and the same accessible name/state.
 * Eligibility is the server's valid ids, resolved into `selection` upstream.
 */
function SelectableDonCard({
  don,
  selection,
  onToggle,
  rested,
  index,
  step,
  donArtUrl,
  motionDelay,
  entering,
  entryIndex,
}: {
  don: DonInstance;
  selection: TargetCardSelectionState;
  onToggle?: (instanceId: string) => void;
  rested: boolean;
  index: number;
  step: number;
  donArtUrl?: string | null;
  motionDelay?: number;
  entering?: boolean;
  entryIndex: number;
}) {
  const descriptionId = useId();
  const disabledReason = selection.disabledReason;
  const toggle = disabledReason ? undefined : () => onToggle?.(don.instanceId);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && toggle) {
      event.preventDefault();
      toggle();
    }
  };
  const highlightRing = selection.selected
    ? ("selected" as const)
    : selection.eligible
      ? ("eligible" as const)
      : undefined;

  return (
    <motion.div
      data-don-instance-id={don.instanceId}
      data-target-selection=""
      data-target-instance-id={don.instanceId}
      layout
      initial={entering ? ENTRY_INITIAL : false}
      animate={{ ...ENTRY_ANIMATE, opacity: disabledReason ? 0.35 : 1 }}
      transition={entering ? entryTransition(entryIndex) : undefined}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={[
        "DON!!",
        rested ? "rested" : "active",
        selection.selected
          ? "selected"
          : selection.eligible
            ? "eligible for selection"
            : null,
        disabledReason,
      ]
        .filter(Boolean)
        .join(". ")}
      aria-pressed={selection.selected}
      aria-disabled={disabledReason ? true : undefined}
      aria-describedby={disabledReason ? descriptionId : undefined}
      className={cn(
        "relative rounded-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gb-signal-eligible",
        rested && "flex items-center justify-center shrink-0",
        toggle ? "cursor-pointer" : "cursor-default",
      )}
      style={{
        ...(rested ? { width: DON_CARD_H, height: DON_CARD_W } : {}),
        marginLeft: index > 0 ? step - (rested ? DON_CARD_H : DON_CARD_W) : 0,
        zIndex: index,
      }}
    >
      <Card
        variant="don"
        state={rested ? "rest" : "active"}
        artUrl={donArtUrl || DEFAULT_DON_IMG}
        motionDelay={motionDelay}
        overlays={{ highlightRing }}
        interaction={{ tooltipNotice: disabledReason ?? undefined }}
      />
      {disabledReason && (
        <span id={descriptionId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </motion.div>
  );
}

export const DonZone = React.memo(function DonZone({
  player,
  style,
  className,
  enableDrag,
  zoneKey,
  animationDelay,
  donArtUrl,
  targetSelectionById,
  onTargetToggle,
}: {
  player: PlayerState | null;
  style: React.CSSProperties;
  className?: string;
  enableDrag?: boolean;
  zoneKey?: string;
  animationDelay?: number;
  donArtUrl?: string | null;
  /** In-place SELECT_TARGET state keyed by instance id (OPT-792). A DON!!
   *  with an entry renders as a selectable target. */
  targetSelectionById?: ReadonlyMap<string, TargetCardSelectionState>;
  onTargetToggle?: (instanceId: string) => void;
}) {
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion();
  // Stable sort: active first, rested second, preserving relative order within each group
  const allDon = [...(player?.donCostArea ?? [])].sort((a, b) => {
    if (a.state === b.state) return 0;
    return a.state === "ACTIVE" ? -1 : 1;
  });
  const hasAny = allDon.length > 0;
  // Detect newly-added DON instanceIds so the turn-start arrival pops in
  // (OPT-121). `useFieldArrivals` seeds empty on the first render so a page
  // rehydrate doesn't replay the pop for existing tokens.
  const arrivals = useFieldArrivals(allDon.map((d) => d.instanceId));

  const donRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos],
  );

  const activeDon = allDon.filter((d) => d.state === "ACTIVE");
  const restedDon = allDon.filter((d) => d.state === "RESTED");
  // A group is "offered" while the server's prompt includes one of its DON!!.
  // Server membership, not transient eligibility: filling the shared count
  // with Characters must not collapse the fan (OPT-792 review).
  const offered = (group: DonInstance[]) =>
    group.some((d) => {
      const selection = targetSelectionById?.get(d.instanceId);
      if (!selection) return false;
      // `offered` is always set by the selection model; hand-built maps
      // without it fall back to the momentary state.
      return selection.offered ?? (selection.eligible || selection.selected);
    });
  const steps = donFanSteps({
    activeCount: activeDon.length,
    restedCount: restedDon.length,
    activeOffered: offered(activeDon),
    restedOffered: offered(restedDon),
    zoneWidth: typeof style.width === "number" ? style.width : stgDonWidth,
  });
  const entryIndexById = new Map(
    allDon.map((don, index) => [don.instanceId, index]),
  );

  return (
    <div
      ref={donRef}
      role="group"
      aria-label={getBoardZoneLabel(
        zoneKey,
        "DON!!",
        `${activeDon.length} active, ${restedDon.length} rested`,
      )}
      className={cn(
        "absolute flex items-center overflow-hidden rounded-md border border-gb-border-strong/30",
        !hasAny && "justify-center",
        className,
      )}
      style={style}
    >
      {!hasAny && (
        <span className="text-base font-semibold text-gb-accent-amber/40 leading-none select-none">
          DON!!
        </span>
      )}

      {hasAny && (
        <div className="flex items-center w-full">
          {/* Active DON group */}
          <div className="flex items-center">
            {activeDon.map((don, i) => {
              const delay = animationDelay ? animationDelay + i * 0.02 : undefined;
              const entering = arrivals.has(don.instanceId) && !reducedMotion;
              const selection = targetSelectionById?.get(don.instanceId);
              if (selection) {
                return (
                  <SelectableDonCard
                    key={don.instanceId}
                    don={don}
                    selection={selection}
                    onToggle={onTargetToggle}
                    rested={false}
                    index={i}
                    step={steps.active}
                    donArtUrl={donArtUrl}
                    motionDelay={delay}
                    entering={entering}
                    entryIndex={entryIndexById.get(don.instanceId) ?? i}
                  />
                );
              }
              if (enableDrag) {
                return (
                  <DraggableDonCard
                    key={don.instanceId}
                    don={don}
                    index={i}
                    step={steps.active}
                    donArtUrl={donArtUrl}
                    motionDelay={delay}
                    entering={entering}
                    entryIndex={entryIndexById.get(don.instanceId) ?? i}
                  />
                );
              }
              return (
                <motion.div
                  key={don.instanceId}
                  data-don-instance-id={don.instanceId}
                  layout
                  initial={entering ? ENTRY_INITIAL : false}
                  animate={ENTRY_ANIMATE}
                  transition={
                    entering
                      ? entryTransition(entryIndexById.get(don.instanceId) ?? i)
                      : undefined
                  }
                  style={{
                    marginLeft: i > 0 ? steps.active - DON_CARD_W : 0,
                    zIndex: i,
                  }}
                >
                  <Card
                    variant="don"
                    state="active"
                    artUrl={donArtUrl || DEFAULT_DON_IMG}
                    motionDelay={delay}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Rested DON group — pushed to opposite end */}
          {restedDon.length > 0 && (
            <div className="flex items-center ml-auto">
              {restedDon.map((don, i) => {
                const entering = arrivals.has(don.instanceId) && !reducedMotion;
                const selection = targetSelectionById?.get(don.instanceId);
                if (selection) {
                  return (
                    <SelectableDonCard
                      key={don.instanceId}
                      don={don}
                      selection={selection}
                      onToggle={onTargetToggle}
                      rested
                      index={i}
                      step={steps.rested}
                      donArtUrl={donArtUrl}
                      motionDelay={
                        animationDelay ? animationDelay + i * 0.02 : undefined
                      }
                      entering={entering}
                      entryIndex={entryIndexById.get(don.instanceId) ?? i}
                    />
                  );
                }
                return (
                  <motion.div
                    key={don.instanceId}
                    data-don-instance-id={don.instanceId}
                    layout
                    initial={entering ? ENTRY_INITIAL : false}
                    animate={ENTRY_ANIMATE}
                    transition={
                      entering
                        ? entryTransition(entryIndexById.get(don.instanceId) ?? i)
                        : undefined
                    }
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: DON_CARD_H,
                      height: DON_CARD_W,
                      marginLeft: i > 0 ? steps.rested - DON_CARD_H : 0,
                      zIndex: i,
                    }}
                  >
                    <Card
                      variant="don"
                      state="rest"
                      artUrl={donArtUrl || DEFAULT_DON_IMG}
                      motionDelay={
                        animationDelay ? animationDelay + i * 0.02 : undefined
                      }
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
