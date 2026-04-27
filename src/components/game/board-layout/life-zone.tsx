"use client";

import React, { useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, LifeCard } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import { cardEntry } from "@/lib/motion";
import { Card } from "../card";

const LIFE_STACK_OFFSET = 20;
const ENTRY_INITIAL = { scale: 0.9, opacity: 0 } as const;
const ENTRY_ANIMATE = { scale: 1, opacity: 1 } as const;

export const LifeZone = React.memo(function LifeZone({
  life,
  cardDb,
  zoneKey,
  style,
  sleeveUrl,
}: {
  life: LifeCard[];
  cardDb: CardDb;
  zoneKey?: string;
  style: React.CSSProperties;
  sleeveUrl?: string | null;
}) {
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos],
  );
  const count = life.length;
  // Detect newly-arrived life cards so the entry pop plays on mount
  // (OPT-121). `useFieldArrivals` seeds empty on the first render, so a page
  // rehydrate doesn't replay the pop for existing life.
  const arrivals = useFieldArrivals(life.map((c) => c.instanceId));

  if (count === 0) {
    return (
      <div ref={ref} style={style}>
        <Card variant="life" data={{ cardDb }} empty emptyLabel="LIFE" />
      </div>
    );
  }

  return (
    <div ref={ref} style={style}>
      {life.map((card, i) => {
        const entering = arrivals.has(card.instanceId) && !reducedMotion;
        return (
          <motion.div
            key={card.instanceId}
            initial={entering ? ENTRY_INITIAL : false}
            animate={ENTRY_ANIMATE}
            transition={entering ? cardEntry : { duration: 0 }}
            style={{
              position: "absolute",
              left: 0,
              top: i * LIFE_STACK_OFFSET,
              zIndex: count - i,
            }}
          >
            <Card
              variant="life"
              data={{ cardDb, cardId: card.face === "UP" ? card.cardId : undefined }}
              faceDown={card.face === "DOWN"}
              sleeveUrl={sleeveUrl}
              overlays={i === 0 ? { countBadge: count } : undefined}
            />
          </motion.div>
        );
      })}
    </div>
  );
});
