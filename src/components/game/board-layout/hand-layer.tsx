"use client";

import React, { useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardData, CardInstance } from "@shared/game-types";
import { handCardHover } from "@/lib/motion";
import { useZonePosition } from "@/contexts/zone-position-context";
import { BoardCard } from "../board-card";
import { FIELD_W, HAND_CARD_W, HAND_CARD_H, type HandCardDrag } from "./constants";

function isCounterEligible(data: CardData | undefined): boolean {
  if (!data) return false;
  if (data.type === "Character" && data.counter != null && data.counter > 0) return true;
  if (data.type === "Event" && data.effectText?.includes("[Counter]")) return true;
  return false;
}

function DraggableHandCard({
  card,
  cardDb,
  width,
  height,
  disabled,
  dimmed,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  width: number;
  height: number;
  disabled?: boolean;
  dimmed?: boolean;
  style?: React.CSSProperties;
}) {
  const reducedMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hand-${card.instanceId}`,
    data: { type: "hand-card", card } satisfies HandCardDrag,
    disabled,
  });

  const skipMotion = reducedMotion || isDragging;

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      whileHover={skipMotion ? undefined : handCardHover}
      style={{
        ...style,
        opacity: isDragging ? 0.3 : dimmed ? 0.35 : 1,
        cursor: disabled ? "default" : "grab",
      }}
    >
      <BoardCard card={card} cardDb={cardDb} width={width} height={height} />
    </motion.div>
  );
}

export const HandLayer = React.memo(function HandLayer({
  cards,
  faceDown,
  cardDb,
  enableDrag,
  counterMode,
  zoneKey,
}: {
  cards: CardInstance[];
  faceDown?: boolean;
  cardDb: CardDb;
  enableDrag?: boolean;
  counterMode?: boolean;
  zoneKey?: string;
}) {
  const count = cards.length;
  const zonePos = useZonePosition();

  const handRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (zoneKey) {
        if (node) zonePos.register(zoneKey, node);
        else zonePos.unregister(zoneKey);
      }
    },
    [zoneKey, zonePos],
  );

  if (count === 0) return null;

  const maxWidth = FIELD_W - 60;
  const totalCardsW = count * HAND_CARD_W;
  const rawGap = count > 1 ? (maxWidth - totalCardsW) / (count - 1) : 0;
  const gap = Math.min(12, rawGap);

  return (
    <div ref={handRef} className="flex items-center pointer-events-auto">
      {cards.map((card, i) => {
        if (faceDown) {
          return (
            <BoardCard
              key={card.instanceId}
              cardDb={cardDb}
              sleeve
              width={HAND_CARD_W}
              height={HAND_CARD_H}
              style={i > 0 ? { marginLeft: gap } : undefined}
            />
          );
        }

        const eligible = counterMode
          ? isCounterEligible(cardDb[card.cardId])
          : true;
        const disabled = !enableDrag || (counterMode && !eligible);

        return (
          <DraggableHandCard
            key={card.instanceId}
            card={card}
            cardDb={cardDb}
            disabled={disabled}
            dimmed={counterMode && !eligible}
            width={HAND_CARD_W}
            height={HAND_CARD_H}
            style={i > 0 ? { marginLeft: gap } : undefined}
          />
        );
      })}
    </div>
  );
});
