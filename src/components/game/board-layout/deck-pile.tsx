"use client";

import type { CSSProperties } from "react";
import type { CardDb } from "@shared/game-types";
import { Card } from "../card";
import { getBoardZoneLabel } from "./accessibility";
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
    <ZoneRef
      zoneKey={zoneKey}
      style={style}
      role="group"
      aria-label={getBoardZoneLabel(
        zoneKey,
        "deck",
        `${visibleCount} ${visibleCount === 1 ? "card" : "cards"}`,
      )}
    >
      <PileReceipt visibleCount={visibleCount}>
        <Card
          variant="trash"
          data={{ cardDb }}
          faceDown
          sleeveUrl={sleeveUrl}
          overlays={{ countBadge: visibleCount, label: "DECK" }}
          interaction={{ clickable: !!onClick }}
          onClick={onClick}
          ariaLabel={`Inspect deck, ${visibleCount} cards`}
        />
      </PileReceipt>
    </ZoneRef>
  );
}
