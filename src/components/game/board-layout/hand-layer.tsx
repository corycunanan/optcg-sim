"use client";

import React, { useCallback, useRef } from "react";
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
  hidden,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  width: number;
  height: number;
  disabled?: boolean;
  dimmed?: boolean;
  /** When true the card reserves layout space but is invisible (in-flight placeholder). */
  hidden?: boolean;
  style?: React.CSSProperties;
}) {
  const reducedMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hand-${card.instanceId}`,
    data: { type: "hand-card", card } satisfies HandCardDrag,
    disabled: disabled || hidden,
  });

  const skipMotion = reducedMotion || isDragging;

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      whileHover={skipMotion || hidden ? undefined : handCardHover}
      style={{
        ...style,
        opacity: isDragging ? 0.3 : dimmed ? 0.35 : 1,
        cursor: disabled || hidden ? "default" : "grab",
        visibility: hidden ? "hidden" : undefined,
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
  inFlightInstanceIds,
  sleeveUrl,
}: {
  cards: CardInstance[];
  faceDown?: boolean;
  cardDb: CardDb;
  enableDrag?: boolean;
  counterMode?: boolean;
  zoneKey?: string;
  /** Set of instanceIds currently in-flight (render as invisible placeholders). */
  inFlightInstanceIds?: Set<string>;
  sleeveUrl?: string | null;
}) {
  const count = cards.length;
  const zonePos = useZonePosition();

  // Track which instanceIds existed in the previous render so we can
  // detect newly-arrived cards and hide them before the transition
  // system catches up (transitions are created in useEffect, one render late).
  // Initialize with null so we can distinguish "first render" from "empty hand".
  const prevIdsRef = useRef<Set<string> | null>(null);
  const currentIds = new Set(cards.map((c) => c.instanceId));
  const newlyArrived = new Set<string>();
  if (prevIdsRef.current !== null) {
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) newlyArrived.add(id);
    }
  }
  prevIdsRef.current = currentIds;

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
        const marginStyle = i > 0 ? { marginLeft: gap } : undefined;
        // Hide if the transition system says in-flight, OR if the card just
        // appeared this render (transition hasn't been created yet).
        const isInFlight =
          (inFlightInstanceIds?.has(card.instanceId) ?? false) ||
          newlyArrived.has(card.instanceId);

        if (faceDown) {
          return (
            <BoardCard
              key={card.instanceId}
              cardDb={cardDb}
              sleeve
              sleeveUrl={sleeveUrl}
              width={HAND_CARD_W}
              height={HAND_CARD_H}
              style={marginStyle}
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
            hidden={isInFlight}
            width={HAND_CARD_W}
            height={HAND_CARD_H}
            style={marginStyle}
          />
        );
      })}
    </div>
  );
});
