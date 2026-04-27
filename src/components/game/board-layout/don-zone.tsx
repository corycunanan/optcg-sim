"use client";

import React, { useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useZonePosition } from "@/contexts/zone-position-context";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import { cardEntry } from "@/lib/motion";
import { Card } from "../card";
import { type ActiveDonDrag } from "./constants";

const DON_CARD_W = 50;
const DON_CARD_H = 70;
const DON_ACTIVE_OVERLAP = 35;
const DON_RESTED_OVERLAP = 60;
const DEFAULT_DON_IMG = "/images/DON/zoro.jpg";

// DON entry pop on turn-start (OPT-121). New tokens scale + fade in; existing
// tokens skip the pop via `initial={false}`. Same shape as field-card entry
// so the cue reads consistently across the board.
const ENTRY_INITIAL = { scale: 0.9, opacity: 0 } as const;

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
  disabled,
  donArtUrl,
  motionDelay,
  entering,
}: {
  don: DonInstance;
  index: number;
  disabled?: boolean;
  donArtUrl?: string | null;
  motionDelay?: number;
  /** Plays the entry pop on mount (OPT-121). Set by `DonZone` for tokens
   *  that weren't in the previous render — typically the freshly-added DON
   *  at turn start. */
  entering?: boolean;
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
      initial={entering ? ENTRY_INITIAL : false}
      animate={{ scale: 1, opacity: isDragging ? 0.3 : 1 }}
      transition={entering ? cardEntry : undefined}
      style={{
        marginLeft: index > 0 ? -DON_ACTIVE_OVERLAP : 0,
        zIndex: index,
        cursor: disabled ? "default" : "grab",
      }}
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

export const DonZone = React.memo(function DonZone({
  player,
  style,
  className,
  enableDrag,
  zoneKey,
  animationDelay,
  donArtUrl,
}: {
  player: PlayerState | null;
  style: React.CSSProperties;
  className?: string;
  enableDrag?: boolean;
  zoneKey?: string;
  animationDelay?: number;
  donArtUrl?: string | null;
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

  return (
    <div
      ref={donRef}
      className={cn(
        "absolute flex items-center overflow-hidden rounded-md border border-gb-border-strong/30",
        !hasAny && "justify-center",
        className,
      )}
      style={style}
    >
      {!hasAny && (
        <span className="text-sm font-bold text-gb-accent-amber/40 leading-none select-none">
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
              if (enableDrag) {
                return (
                  <DraggableDonCard
                    key={don.instanceId}
                    don={don}
                    index={i}
                    donArtUrl={donArtUrl}
                    motionDelay={delay}
                    entering={entering}
                  />
                );
              }
              return (
                <motion.div
                  key={don.instanceId}
                  layout
                  initial={entering ? ENTRY_INITIAL : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={entering ? cardEntry : undefined}
                  style={{
                    marginLeft: i > 0 ? -DON_ACTIVE_OVERLAP : 0,
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
                return (
                  <motion.div
                    key={don.instanceId}
                    layout
                    initial={entering ? ENTRY_INITIAL : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={entering ? cardEntry : undefined}
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: DON_CARD_H,
                      height: DON_CARD_W,
                      marginLeft: i > 0 ? -DON_RESTED_OVERLAP : 0,
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
