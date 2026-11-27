"use client";

import type { CSSProperties } from "react";
import { Card } from "../card";
import { getBoardZoneLabel } from "./accessibility";
import { PileReceipt } from "./pile-receipt";
import { ZoneRef } from "./zone-ref";

/**
 * The DON!! deck as a face-down pile under the Life zone (OPT-1057, rule
 * 3-3-2). It gives DON!! Phase placement a visible source and DON!! returns a
 * visible destination, so DON!! travel to and from it instead of popping in
 * place. It shows the DON!! back and a count, the open information the rules
 * allow.
 */
export function DonDeckPile({
  count,
  arrivingCount = 0,
  zoneKey,
  style,
}: {
  count: number;
  arrivingCount?: number;
  zoneKey: string;
  style: CSSProperties;
}) {
  const visibleCount = Math.max(0, count - arrivingCount);

  return (
    <ZoneRef
      zoneKey={zoneKey}
      style={style}
      role="group"
      aria-label={getBoardZoneLabel(
        zoneKey,
        "DON!! deck",
        `${visibleCount} DON!!`,
      )}
    >
      <PileReceipt visibleCount={visibleCount}>
        <Card
          variant="trash"
          faceDown
          empty={visibleCount === 0}
          emptyLabel="DON!!"
          donBack
          overlays={{ countBadge: visibleCount }}
          interaction={{ tooltipDisabled: true }}
        />
      </PileReceipt>
    </ZoneRef>
  );
}
