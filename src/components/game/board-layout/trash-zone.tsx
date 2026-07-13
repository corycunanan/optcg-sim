"use client";

import React, { useCallback } from "react";
import type { CardDb, CardInstance } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { Card } from "../card";
import { BOARD_CARD_W, BOARD_CARD_H } from "./constants";
import { PileReceipt } from "./pile-receipt";

export const DroppableTrashZone = React.memo(function DroppableTrashZone({
  trash,
  cardDb,
  onClickTrash,
  zoneKey,
  arrivingCount = 0,
  style,
}: {
  trash: CardInstance[];
  cardDb: CardDb;
  onClickTrash?: () => void;
  zoneKey?: string;
  /** Number of cards still traveling/transforming into this pile. The new
   *  top/count stay held until the transition completes. */
  arrivingCount?: number;
  style?: React.CSSProperties;
}) {
  const zonePos = useZonePosition();

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos]
  );

  const visibleTrash = arrivingCount > 0 ? trash.slice(arrivingCount) : trash;
  const topCard = visibleTrash.length > 0 ? visibleTrash[0] : undefined;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ ...style, width: BOARD_CARD_W, height: BOARD_CARD_H }}
    >
      <PileReceipt visibleCount={visibleTrash.length}>
        <Card
          variant="trash"
          data={{ cardDb, card: topCard }}
          empty={!topCard}
          emptyLabel="TRASH"
          overlays={
            visibleTrash.length > 1
              ? { countBadge: visibleTrash.length }
              : undefined
          }
          interaction={{ clickable: !!onClickTrash }}
          onClick={onClickTrash}
          className="relative z-[1]"
        />
      </PileReceipt>
    </div>
  );
});
