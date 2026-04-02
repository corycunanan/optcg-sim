"use client";

import React, { useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { cardHover, cardTap, cardRest, cardActivate } from "@/lib/motion";
import { useZonePosition } from "@/contexts/zone-position-context";
import { type ActiveDonDrag } from "./constants";

const DON_CARD_W = 50;
const DON_CARD_H = 70;
const DON_ACTIVE_OVERLAP = 35;
const DON_RESTED_OVERLAP = 60;
const DON_IMG = "/images/DON/zoro.jpg";
export const DonCard = React.memo(function DonCard({ rested }: { rested?: boolean }) {
  return (
    <motion.div
      className="rounded shrink-0 overflow-hidden shadow-don"
      style={{ width: DON_CARD_W, height: DON_CARD_H }}
      animate={{
        rotate: rested ? 90 : 0,
        filter: rested ? "brightness(0.6)" : "brightness(1)",
      }}
      transition={rested ? cardRest : cardActivate}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DON_IMG}
        alt="DON!!"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </motion.div>
  );
});

function DraggableDonCard({
  don,
  index,
  disabled,
}: {
  don: DonInstance;
  index: number;
  disabled?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `don-${don.instanceId}`,
    data: { type: "active-don", don } satisfies ActiveDonDrag,
    disabled,
  });

  const skipMotion = reducedMotion || isDragging;

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      whileHover={skipMotion ? undefined : cardHover}
      whileTap={skipMotion ? undefined : cardTap}
      style={{
        marginLeft: index > 0 ? -DON_ACTIVE_OVERLAP : 0,
        zIndex: index,
        opacity: isDragging ? 0.3 : 1,
        cursor: disabled ? "default" : "grab",
      }}
    >
      <DonCard />
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
}: {
  player: PlayerState | null;
  style: React.CSSProperties;
  className?: string;
  enableDrag?: boolean;
  zoneKey?: string;
  animationDelay?: number;
}) {
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion();
  // Stable sort: active first, rested second, preserving relative order within each group
  const allDon = [...(player?.donCostArea ?? [])].sort((a, b) => {
    if (a.state === b.state) return 0;
    return a.state === "ACTIVE" ? -1 : 1;
  });
  const hasAny = allDon.length > 0;

  const donRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos],
  );

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
        <span className="text-xs font-bold text-gb-accent-amber/40 leading-none select-none">
          DON!!
        </span>
      )}

      {hasAny && (
        <div className="flex items-center w-full">
          {/* Active DON group */}
          <div className="flex items-center">
            {allDon.filter((d) => d.state === "ACTIVE").map((don, i) => (
              <motion.div
                key={don.instanceId}
                layout
                whileHover={reducedMotion ? undefined : cardHover}
                transition={{
                  ...(cardActivate),
                  delay: animationDelay ? animationDelay + i * 0.02 : 0,
                }}
                style={{
                  marginLeft: i > 0 ? -DON_ACTIVE_OVERLAP : 0,
                  zIndex: i,
                }}
              >
                {enableDrag ? (
                  <DraggableDonCard don={don} index={0} />
                ) : (
                  <DonCard />
                )}
              </motion.div>
            ))}
          </div>

          {/* Rested DON group — pushed to opposite end */}
          {allDon.some((d) => d.state === "RESTED") && (
            <div className="flex items-center ml-auto">
              {allDon.filter((d) => d.state === "RESTED").map((don, i) => (
                <motion.div
                  key={don.instanceId}
                  layout
                  whileHover={reducedMotion ? undefined : cardHover}
                  className="flex items-center justify-center shrink-0"
                  transition={{
                    ...(cardRest),
                    delay: animationDelay ? animationDelay + i * 0.02 : 0,
                  }}
                  style={{
                    width: DON_CARD_H,
                    height: DON_CARD_W,
                    marginLeft: i > 0 ? -DON_RESTED_OVERLAP : 0,
                    zIndex: i,
                  }}
                >
                  <DonCard rested />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
