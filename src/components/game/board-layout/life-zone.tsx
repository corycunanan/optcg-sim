"use client";

import React, { useCallback } from "react";
import type { CardDb, LifeCard } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { Card } from "../card";
import { PileReceipt } from "./pile-receipt";

const LIFE_STACK_OFFSET = 20;

export const LifeZone = React.memo(function LifeZone({
  life,
  cardDb,
  zoneKey,
  style,
  sleeveUrl,
  arrivingCount = 0,
}: {
  life: LifeCard[];
  cardDb: CardDb;
  zoneKey?: string;
  style: React.CSSProperties;
  sleeveUrl?: string | null;
  arrivingCount?: number;
}) {
  const zonePos = useZonePosition();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos]
  );
  const visibleLife = arrivingCount > 0 ? life.slice(arrivingCount) : life;
  const count = visibleLife.length;
  const topCard = visibleLife[0];

  return (
    <div ref={ref} style={style}>
      <div
        className="absolute top-0 left-0"
        style={{ zIndex: Math.max(1, count) }}
      >
        <PileReceipt visibleCount={count}>
          {topCard ? (
            <Card
              variant="life"
              data={{
                cardDb,
                cardId: topCard.face === "UP" ? topCard.cardId : undefined,
              }}
              faceDown={topCard.face === "DOWN"}
              sleeveUrl={sleeveUrl}
              overlays={{ countBadge: count }}
            />
          ) : (
            <Card variant="life" data={{ cardDb }} empty emptyLabel="LIFE" />
          )}
        </PileReceipt>
      </div>

      {visibleLife.slice(1).map((card, index) => {
        const stackIndex = index + 1;
        return (
          <div
            key={card.instanceId}
            style={{
              position: "absolute",
              left: 0,
              top: stackIndex * LIFE_STACK_OFFSET,
              zIndex: count - stackIndex,
            }}
          >
            <Card
              variant="life"
              data={{
                cardDb,
                cardId: card.face === "UP" ? card.cardId : undefined,
              }}
              faceDown={card.face === "DOWN"}
              sleeveUrl={sleeveUrl}
            />
          </div>
        );
      })}
    </div>
  );
});
