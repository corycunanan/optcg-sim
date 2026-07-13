"use client";

import type { CSSProperties } from "react";
import type { CardDb } from "@shared/game-types";
import { Card } from "../card";
import { PileReceipt } from "./pile-receipt";
import { ZoneRef } from "./zone-ref";

export function DeckPile({
  count,
  arrivingCount = 0,
  cardDb,
  sleeveUrl,
  zoneKey,
  style,
  onClick,
}: {
  count: number;
  arrivingCount?: number;
  cardDb: CardDb;
  sleeveUrl?: string | null;
  zoneKey: string;
  style: CSSProperties;
  onClick?: () => void;
}) {
  const visibleCount = Math.max(0, count - arrivingCount);

  return (
    <ZoneRef zoneKey={zoneKey} style={style}>
      <PileReceipt visibleCount={visibleCount}>
        <Card
          variant="trash"
          data={{ cardDb }}
          faceDown
          sleeveUrl={sleeveUrl}
          overlays={{ countBadge: visibleCount, label: "DECK" }}
          interaction={{ clickable: !!onClick }}
          onClick={onClick}
        />
      </PileReceipt>
    </ZoneRef>
  );
}
