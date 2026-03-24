"use client";

import { useDraggable } from "@dnd-kit/core";
import type { CardDb, CardInstance } from "@shared/game-types";
import { BoardCard } from "../board-card";
import { FIELD_W, HAND_CARD_W, HAND_CARD_H, type HandCardDrag } from "./constants";

function DraggableHandCard({
  card,
  cardDb,
  width,
  height,
  disabled,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  width: number;
  height: number;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hand-${card.instanceId}`,
    data: { type: "hand-card", card } satisfies HandCardDrag,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        opacity: isDragging ? 0.3 : 1,
        cursor: disabled ? "default" : "grab",
      }}
    >
      <BoardCard card={card} cardDb={cardDb} width={width} height={height} />
    </div>
  );
}

export function HandLayer({
  cards,
  faceDown,
  cardDb,
  enableDrag,
}: {
  cards: CardInstance[];
  faceDown?: boolean;
  cardDb: CardDb;
  enableDrag?: boolean;
}) {
  const count = cards.length;
  if (count === 0) return null;

  const maxWidth = FIELD_W - 60;
  const totalCardsW = count * HAND_CARD_W;
  const rawGap = count > 1 ? (maxWidth - totalCardsW) / (count - 1) : 0;
  const gap = Math.min(12, rawGap);

  return (
    <div className="flex items-center pointer-events-auto">
      {cards.map((card, i) =>
        faceDown ? (
          <BoardCard
            key={card.instanceId}
            cardDb={cardDb}
            faceDown
            width={HAND_CARD_W}
            height={HAND_CARD_H}
            style={i > 0 ? { marginLeft: gap } : undefined}
          />
        ) : (
          <DraggableHandCard
            key={card.instanceId}
            card={card}
            cardDb={cardDb}
            disabled={!enableDrag}
            width={HAND_CARD_W}
            height={HAND_CARD_H}
            style={i > 0 ? { marginLeft: gap } : undefined}
          />
        ),
      )}
    </div>
  );
}
