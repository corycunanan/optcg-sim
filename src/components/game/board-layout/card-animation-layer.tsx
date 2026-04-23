"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { useZonePosition } from "@/contexts/zone-position-context";
import { cardTransitions } from "@/lib/motion";
import { Card } from "../card";
import { BOARD_CARD_W, BOARD_CARD_H, HAND_CARD_W, HAND_CARD_H } from "./constants";

interface CardAnimationLayerProps {
  transitions: CardTransition[];
  cardDb: CardDb;
  onComplete: (id: string) => void;
  sleeveUrls?: [string | null, string | null];
}

/**
 * Delay before triggering a mid-flight flip on life reveals (OPT-276).
 * Smaller than the `cardTransitions.zoneMove` spring settle time so the
 * flip lands while the card is still visibly flying — not at the endpoint.
 */
const LIFE_REVEAL_FLIP_DELAY_MS = 180;

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

  // Life reveal (OPT-276): when a card flies FROM a life zone AND we know
  // its id (viewer's own reveal), start face-down to match the life stack
  // and flip mid-flight. Opponent-side reveals keep cardId=null and stay
  // face-down throughout. Non-life flights use the default: face-up when
  // id is known, face-down when it isn't.
  const revealsMidFlight =
    transition.fromZoneKey.endsWith("-life") && !!transition.cardId;
  const [faceDown, setFaceDown] = React.useState(
    revealsMidFlight ? true : !transition.cardId,
  );

  // If we can't resolve both positions, clean up immediately
  React.useEffect(() => {
    if (!canAnimate) onComplete();
  }, [canAnimate, onComplete]);

  // Schedule the mid-flight flip. Guarded by `canAnimate` so we don't queue
  // a setState after the FlyingCard unmounts through the clean-up path.
  React.useEffect(() => {
    if (!canAnimate || !revealsMidFlight) return;
    const timer = setTimeout(() => setFaceDown(false), LIFE_REVEAL_FLIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canAnimate, revealsMidFlight]);

  if (!canAnimate) return null;

  const isFromHand = transition.fromZoneKey.endsWith("-hand");
  const isHandBound = transition.toZoneKey.endsWith("-hand");

  // Use hand card dimensions when the card starts or ends in a hand zone
  const fromW = isFromHand ? HAND_CARD_W : BOARD_CARD_W;
  const fromH = isFromHand ? HAND_CARD_H : BOARD_CARD_H;
  const toW = isHandBound ? HAND_CARD_W : BOARD_CARD_W;
  const toH = isHandBound ? HAND_CARD_H : BOARD_CARD_H;

  // Cards arriving in hand target the right edge (end of hand fan)
  const toX = isHandBound
    ? toRect.right - toW
    : toRect.left + (toRect.width - toW) / 2;
  const toY = toRect.top + (toRect.height - toH) / 2;

  // Variant tracks the destination footprint — the primitive's size token
  // matches the outer motion.div's animated `toW/toH` so the card settles
  // into the destination zone at exactly the right dimensions.
  const variant = isHandBound ? "hand" : "field";

  return (
    <motion.div
      initial={{
        x: fromRect.left + (fromRect.width - fromW) / 2,
        y: fromRect.top + (fromRect.height - fromH) / 2,
        width: fromW,
        height: fromH,
        opacity: 1,
        scale: 1,
      }}
      animate={{
        x: toX,
        y: toY,
        width: toW,
        height: toH,
        opacity: 1,
        scale: 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={cardTransitions.zoneMove}
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
        faceDown={faceDown}
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
