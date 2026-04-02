"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { useZonePosition } from "@/contexts/zone-position-context";
import { cardTransitions } from "@/lib/motion";
import { BoardCard } from "../board-card";
import { BOARD_CARD_W, BOARD_CARD_H } from "./constants";

interface CardAnimationLayerProps {
  transitions: CardTransition[];
  cardDb: CardDb;
  onComplete: (id: string) => void;
}

function FlyingCard({
  transition,
  cardDb,
  onComplete,
}: {
  transition: CardTransition;
  cardDb: CardDb;
  onComplete: () => void;
}) {
  const zonePos = useZonePosition();
  const fromRect = zonePos.getRect(transition.fromZoneKey);
  const toRect = zonePos.getRect(transition.toZoneKey);
  const canAnimate = !!fromRect && !!toRect;

  // If we can't resolve both positions, clean up immediately
  React.useEffect(() => {
    if (!canAnimate) onComplete();
  }, [canAnimate, onComplete]);

  if (!canAnimate) return null;

  const isHandBound = transition.toZoneKey.endsWith("-hand");

  // Cards arriving in hand target the right edge (end of hand fan)
  const toX = isHandBound
    ? toRect.right - BOARD_CARD_W
    : toRect.left + (toRect.width - BOARD_CARD_W) / 2;
  const toY = toRect.top + (toRect.height - BOARD_CARD_H) / 2;

  return (
    <motion.div
      initial={{
        x: fromRect.left + (fromRect.width - BOARD_CARD_W) / 2,
        y: fromRect.top + (fromRect.height - BOARD_CARD_H) / 2,
        opacity: 1,
        scale: 1,
      }}
      animate={{
        x: toX,
        y: toY,
        opacity: 1,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={cardTransitions.zoneMove}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        width: BOARD_CARD_W,
        height: BOARD_CARD_H,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <BoardCard
        cardId={transition.cardId ?? undefined}
        cardDb={cardDb}
        sleeve={!transition.cardId}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
      />
    </motion.div>
  );
}

export const CardAnimationLayer = React.memo(function CardAnimationLayer({
  transitions,
  cardDb,
  onComplete,
}: CardAnimationLayerProps) {
  const reducedMotion = useReducedMotion();

  // Skip all flying animations when reduced motion is preferred
  if (reducedMotion) return null;
  if (transitions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <AnimatePresence>
        {transitions.map((t) => (
          <FlyingCard
            key={t.id}
            transition={t}
            cardDb={cardDb}
            onComplete={() => onComplete(t.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});
