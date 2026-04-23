"use client";

import React, { useCallback, useRef } from "react";
import type { CardDb, LifeCard } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { Card } from "../card";

const LIFE_STACK_OFFSET = 20;

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

  // Track previous face per instanceId so we can tell the Card primitive to
  // animate from the opposite face on mount (OPT-276). This survives Card
  // remounts and works around motion.dev's animate-prop detection failing
  // when the flip commits in the same render as a Radix Dialog portal
  // opening (e.g. Shirahoshi's leader activation).
  const prevFacesRef = useRef<Map<string, "UP" | "DOWN">>(new Map());
  const flipFromByInstance = React.useMemo(() => {
    const map = new Map<string, "UP" | "DOWN">();
    for (const card of life) {
      const prev = prevFacesRef.current.get(card.instanceId);
      if (prev !== undefined && prev !== card.face) {
        map.set(card.instanceId, prev);
      }
    }
    return map;
  }, [life]);

  // Update the ref after render so the *next* render sees current state as
  // "previous." Running in an effect keeps the diff deterministic relative
  // to commit ordering.
  React.useEffect(() => {
    const next = new Map<string, "UP" | "DOWN">();
    for (const card of life) {
      next.set(card.instanceId, card.face);
    }
    prevFacesRef.current = next;
  }, [life]);

  if (count === 0) {
    return (
      <div ref={ref} style={style}>
        <Card variant="life" data={{ cardDb }} empty emptyLabel="LIFE" />
      </div>
    );
  }

  return (
    <div ref={ref} style={style}>
      {life.map((card, i) => (
        <Card
          key={card.instanceId}
          variant="life"
          data={{ cardDb, cardId: card.face === "UP" ? card.cardId : undefined }}
          faceDown={card.face === "DOWN"}
          flipFrom={flipFromByInstance.get(card.instanceId)}
          sleeveUrl={sleeveUrl}
          overlays={i === 0 ? { countBadge: count } : undefined}
          style={{
            position: "absolute",
            left: 0,
            top: i * LIFE_STACK_OFFSET,
            zIndex: count - i,
          }}
        />
      ))}
    </div>
  );
});
