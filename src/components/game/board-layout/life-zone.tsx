"use client";

import React, { useCallback } from "react";
import type { CardDb, LifeCard } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import { BoardCard } from "../board-card";
import { BOARD_CARD_W, BOARD_CARD_H } from "./constants";

const LIFE_STACK_OFFSET = 20;

export const LifeZone = React.memo(function LifeZone({
  life,
  cardDb,
  zoneKey,
  style,
}: {
  life: LifeCard[];
  cardDb: CardDb;
  zoneKey?: string;
  style: React.CSSProperties;
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
        <BoardCard
          cardDb={cardDb}
          empty
          label="LIFE"
          width={BOARD_CARD_W}
          height={BOARD_CARD_H}
        />
      </div>
    );
  }

  return (
    <div ref={ref} style={style}>
      {life.map((card, i) => (
        <BoardCard
          key={card.instanceId}
          cardDb={cardDb}
          sleeve
          count={i === 0 ? count : undefined}
          width={BOARD_CARD_W}
          height={BOARD_CARD_H}
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
