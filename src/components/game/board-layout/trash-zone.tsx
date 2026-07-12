"use client";

import React, { useCallback } from "react";
import type { CardDb, CardInstance } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { Card } from "../card";
import { BOARD_CARD_W, BOARD_CARD_H } from "./constants";

export const DroppableTrashZone = React.memo(function DroppableTrashZone({
  trash,
  cardDb,
  onClickTrash,
  zoneKey,
  arrivingInstanceIds,
  style,
}: {
  trash: CardInstance[];
  cardDb: CardDb;
  onClickTrash?: () => void;
  zoneKey?: string;
  /** Instance IDs currently flying into this trash zone — hidden from the
   *  top-card render + count until their flight completes, so the trash
   *  doesn't pop to the new top before the ghost lands (OPT-274). */
  arrivingInstanceIds?: Set<string>;
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
    [zoneKey, zonePos],
  );

  const visibleTrash =
    arrivingInstanceIds && arrivingInstanceIds.size > 0
      ? trash.filter((c) => !arrivingInstanceIds.has(c.instanceId))
      : trash;
  const topCard = visibleTrash.length > 0 ? visibleTrash[0] : undefined;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center"
      style={{ ...style, width: BOARD_CARD_W, height: BOARD_CARD_H }}
    >
      <Card
        variant="trash"
        data={{ cardDb, card: topCard }}
        empty={!topCard}
        emptyLabel="TRASH"
        overlays={
          visibleTrash.length > 1 ? { countBadge: visibleTrash.length } : undefined
        }
        interaction={{ clickable: !!onClickTrash }}
        onClick={onClickTrash}
        className="relative z-[1]"
      />
    </div>
  );
});
