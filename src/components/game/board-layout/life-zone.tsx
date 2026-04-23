"use client";

import React, { useCallback } from "react";
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
