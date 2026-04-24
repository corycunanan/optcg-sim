"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { useZonePosition } from "@/contexts/zone-position-context";
import { cardKO, cardTransitions } from "@/lib/motion";
import { Card } from "../card";
import { BOARD_CARD_W, BOARD_CARD_H, HAND_CARD_W, HAND_CARD_H } from "./constants";

interface CardAnimationLayerProps {
  transitions: CardTransition[];
  cardDb: CardDb;
  onComplete: (id: string) => void;
  sleeveUrls?: [string | null, string | null];
}

function FlyingCard({
  transition,
  cardDb,
  onComplete,
  sleeveUrl,
}: {
  transition: CardTransition;
  cardDb: CardDb;
  onComplete: () => void;
  sleeveUrl?: string | null;
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

  const isFromHand = transition.fromZoneKey.endsWith("-hand");
  const isHandBound = transition.toZoneKey.endsWith("-hand");

  // Use hand card dimensions when the card starts or ends in a hand zone
  const fromW = isFromHand ? HAND_CARD_W : BOARD_CARD_W;
  const fromH = isFromHand ? HAND_CARD_H : BOARD_CARD_H;
  const toW = isHandBound ? HAND_CARD_W : BOARD_CARD_W;
  const toH = isHandBound ? HAND_CARD_H : BOARD_CARD_H;

  const fromX = fromRect.left + (fromRect.width - fromW) / 2;
  const fromY = fromRect.top + (fromRect.height - fromH) / 2;
  // Cards arriving in hand target the right edge (end of hand fan)
  const toX = isHandBound
    ? toRect.right - toW
    : toRect.left + (toRect.width - toW) / 2;
  const toY = toRect.top + (toRect.height - toH) / 2;

  // Variant tracks the destination footprint — the primitive's size token
  // matches the outer motion.div's animated `toW/toH` so the card settles
  // into the destination zone at exactly the right dimensions.
  const variant = isHandBound ? "hand" : "field";
  const isFaceDown = !transition.cardId;

  const isKO = transition.kind === "ko";

  // KO flights get a two-phase sequence: pause at source with a shrink +
  // opacity dip (cardKO preset), then fly to trash. `times` places the dip
  // at ~30% of the total duration so the "shrink" reads before the flight
  // starts. Normal flights use the existing spring for continuity.
  const animateTarget = isKO
    ? {
        x: [fromX, fromX, toX] as number[],
        y: [fromY, fromY, toY] as number[],
        width: [fromW, fromW, toW] as number[],
        height: [fromH, fromH, toH] as number[],
        scale: cardKO.scale,
        opacity: cardKO.opacity,
      }
    : { x: toX, y: toY, width: toW, height: toH, opacity: 1, scale: 1 };

  const transitionConfig = isKO
    ? { duration: 0.65, times: [0, 0.3, 1] as number[], ease: "easeOut" as const }
    : cardTransitions.zoneMove;

  return (
    <motion.div
      initial={{ x: fromX, y: fromY, width: fromW, height: fromH, opacity: 1, scale: 1 }}
      animate={animateTarget}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={transitionConfig}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <Card
        variant={variant}
        state="in-flight"
        data={
          transition.cardId ? { cardId: transition.cardId, cardDb } : undefined
        }
        faceDown={isFaceDown}
        sleeveUrl={sleeveUrl}
        interaction={{ tooltipDisabled: true }}
      />
    </motion.div>
  );
}

export const CardAnimationLayer = React.memo(function CardAnimationLayer({
  transitions,
  cardDb,
  onComplete,
  sleeveUrls,
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
            sleeveUrl={sleeveUrls?.[t.playerIndex] ?? null}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});
