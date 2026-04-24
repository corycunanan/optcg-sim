"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { useZonePosition } from "@/contexts/zone-position-context";
import { cardKO, cardTransitions } from "@/lib/motion";
import { Card } from "../card";
import { BOARD_CARD_W, BOARD_CARD_H, HAND_CARD_W, HAND_CARD_H } from "./constants";

const DON_TOKEN_W = 50;
const DON_TOKEN_H = 70;

interface CardAnimationLayerProps {
  transitions: CardTransition[];
  cardDb: CardDb;
  onComplete: (id: string) => void;
  sleeveUrls?: [string | null, string | null];
  donArtUrls?: [string | null, string | null];
}

function FlyingCard({
  transition,
  cardDb,
  onComplete,
  sleeveUrl,
  donArtUrl,
}: {
  transition: CardTransition;
  cardDb: CardDb;
  onComplete: () => void;
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
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
  const isKO = transition.kind === "ko";
  const isDonAttach = transition.kind === "don-attach";

  // Flight footprint depends on kind. DON tokens are smaller than cards and
  // stay DON-sized for the entire flight; card flights size to their
  // source/destination zone.
  const fromW = isDonAttach ? DON_TOKEN_W : isFromHand ? HAND_CARD_W : BOARD_CARD_W;
  const fromH = isDonAttach ? DON_TOKEN_H : isFromHand ? HAND_CARD_H : BOARD_CARD_H;
  const toW = isDonAttach ? DON_TOKEN_W : isHandBound ? HAND_CARD_W : BOARD_CARD_W;
  const toH = isDonAttach ? DON_TOKEN_H : isHandBound ? HAND_CARD_H : BOARD_CARD_H;

  const fromX = fromRect.left + (fromRect.width - fromW) / 2;
  const fromY = fromRect.top + (fromRect.height - fromH) / 2;
  // Cards arriving in hand target the right edge (end of hand fan); DON
  // tokens aim for the target card's center.
  const toX = isHandBound && !isDonAttach
    ? toRect.right - toW
    : toRect.left + (toRect.width - toW) / 2;
  const toY = toRect.top + (toRect.height - toH) / 2;

  // Variant tracks the destination footprint — the primitive's size token
  // matches the outer motion.div's animated `toW/toH` so the card settles
  // into the destination zone at exactly the right dimensions.
  const variant = isDonAttach ? "don" : isHandBound ? "hand" : "field";
  const isFaceDown = !transition.cardId;

  const delay = transition.delay ?? 0;

  // KO flights get a two-phase sequence: pause at source with a shrink +
  // opacity dip (cardKO preset), then fly to trash. `times` places the dip
  // at ~30% of the total duration so the "shrink" reads before the flight
  // starts. All other flights (including hand-bound + DON-attach) share a
  // straight-line, fast easeOut tween for consistency — the arrival pop is
  // delivered by the destination card's `cardEntry` mount animation, not by
  // the flight layer. The entry animation composes with the flight
  // `onAnimationComplete` cleanly via `AnimatePresence`.
  let animateTarget: Record<string, number | number[]>;
  let transitionConfig: Record<string, unknown>;

  if (isKO) {
    animateTarget = {
      x: [fromX, fromX, toX],
      y: [fromY, fromY, toY],
      width: [fromW, fromW, toW],
      height: [fromH, fromH, toH],
      scale: cardKO.scale as number[],
      opacity: cardKO.opacity as number[],
    };
    transitionConfig = {
      duration: 0.45,
      times: [0, 0.3, 1],
      ease: "easeOut",
      delay,
    };
  } else if (isDonAttach) {
    animateTarget = {
      x: toX,
      y: toY,
      width: toW,
      height: toH,
      opacity: 1,
      scale: 1,
    };
    transitionConfig = { ...cardTransitions.donAttach, delay };
  } else {
    animateTarget = {
      x: toX,
      y: toY,
      width: toW,
      height: toH,
      opacity: 1,
      scale: 1,
    };
    transitionConfig = { ...cardTransitions.zoneMove, delay };
  }

  return (
    <motion.div
      initial={{
        x: fromX,
        y: fromY,
        width: fromW,
        height: fromH,
        opacity: isDonAttach ? 0 : 1,
        scale: 1,
      }}
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
      {isDonAttach ? (
        <Card variant="don" state="in-flight" artUrl={donArtUrl ?? undefined} />
      ) : (
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
      )}
    </motion.div>
  );
}

export const CardAnimationLayer = React.memo(function CardAnimationLayer({
  transitions,
  cardDb,
  onComplete,
  sleeveUrls,
  donArtUrls,
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
            donArtUrl={donArtUrls?.[t.playerIndex] ?? null}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});
