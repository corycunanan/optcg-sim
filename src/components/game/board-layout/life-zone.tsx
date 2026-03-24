"use client";

import type { CardDb, LifeCard } from "@shared/game-types";
import { BoardCard } from "../board-card";
import { BOARD_CARD_W, BOARD_CARD_H } from "./constants";

const LIFE_STACK_OFFSET = 20;

export function LifeZone({
  life,
  cardDb,
  style,
}: {
  life: LifeCard[];
  cardDb: CardDb;
  style: React.CSSProperties;
}) {
  const count = life.length;

  if (count === 0) {
    return (
      <BoardCard
        cardDb={cardDb}
        empty
        label="LIFE"
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
        style={style}
      />
    );
  }

  return (
    <div style={style}>
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
}
