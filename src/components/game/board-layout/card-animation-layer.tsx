"use client";

import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { useZonePosition } from "@/contexts/zone-position-context";
import { cardFizzle, cardFizzleReduced, cardTransitions } from "@/lib/motion";
import { getPortalContainer } from "../scaled-board";
import { Card } from "../card";
import {
  BOARD_CARD_W,
  BOARD_CARD_H,
  HAND_CARD_W,
  HAND_CARD_H,
} from "./constants";

const DON_TOKEN_W = 50;
const DON_TOKEN_H = 70;
const FILL_TRANSITION_FRAME = { width: "100%", height: "100%" } as const;

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
  reducedMotion,
}: {
  transition: CardTransition;
  cardDb: CardDb;
  onComplete: () => void;
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
  reducedMotion: boolean;
}) {
  const zonePos = useZonePosition();
  const isTransform = transition.kind === "transform";
  const isDonAttach = transition.kind === "don-attach";
  const fromRect = zonePos.getRect(transition.fromZoneKey);
  const toRect = zonePos.getRect(transition.toZoneKey);
  const canAnimate = Boolean(
    fromRect && (isTransform || toRect) && (!reducedMotion || isTransform)
  );

  // If we can't resolve both positions, clean up immediately
  React.useEffect(() => {
    if (!canAnimate) onComplete();
  }, [canAnimate, onComplete]);

  if (!canAnimate || !fromRect) return null;

  const isFromHand = transition.fromZoneKey.endsWith("-hand");
  const isHandBound = transition.toZoneKey.endsWith("-hand");
  const isFromSpotlight = transition.spotlightSourceSize !== undefined;
  const destinationRect = toRect ?? fromRect;

  // Flight footprint depends on kind. DON tokens are smaller than cards and
  // stay DON-sized for the entire flight; card flights size to their
  // source/destination zone.
  const fromW = isDonAttach
    ? DON_TOKEN_W
    : isFromSpotlight
      ? fromRect.width
      : isFromHand
        ? HAND_CARD_W
        : BOARD_CARD_W;
  const fromH = isDonAttach
    ? DON_TOKEN_H
    : isFromSpotlight
      ? fromRect.height
      : isFromHand
        ? HAND_CARD_H
        : BOARD_CARD_H;
  const toW = isDonAttach
    ? DON_TOKEN_W
    : isHandBound
      ? HAND_CARD_W
      : BOARD_CARD_W;
  const toH = isDonAttach
    ? DON_TOKEN_H
    : isHandBound
      ? HAND_CARD_H
      : BOARD_CARD_H;

  const fromX = fromRect.left + (fromRect.width - fromW) / 2;
  const fromY = fromRect.top + (fromRect.height - fromH) / 2;
  // Cards arriving in hand target the right edge (end of hand fan); DON
  // tokens aim for the target card's center.
  const toX =
    isHandBound && !isDonAttach
      ? destinationRect.right - toW
      : destinationRect.left + (destinationRect.width - toW) / 2;
  const toY = destinationRect.top + (destinationRect.height - toH) / 2;

  // Variant tracks the destination footprint — the primitive's size token
  // matches the outer motion.div's animated `toW/toH` so the card settles
  // into the destination zone at exactly the right dimensions.
  const variant = isDonAttach
    ? "don"
    : isFromSpotlight
      ? "modal"
      : isHandBound
        ? "hand"
        : "field";
  const isFaceDown = !transition.cardId || transition.cardId === "hidden";

  const delay = transition.delay ?? 0;

  // Transform-class cards dissolve at the source; travel cards keep the
  // existing straight-line flight. Destination pile receipt is owned by the
  // pile components after this transition completes.
  let animateTarget: Record<string, number | number[]>;
  let transitionConfig: Record<string, unknown>;

  if (isTransform) {
    const fizzle = reducedMotion ? cardFizzleReduced : cardFizzle;
    animateTarget = {
      x: fromX,
      y: reducedMotion ? fromY : cardFizzle.y.map((offset) => fromY + offset),
      width: fromW,
      height: fromH,
      scale: reducedMotion ? 1 : (cardFizzle.scale as number[]),
      opacity: fizzle.opacity as number[],
    };
    transitionConfig = { ...fizzle.transition, delay };
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
      exit={{ opacity: 0 }}
      transition={transitionConfig}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {isDonAttach ? (
        <Card
          variant="don"
          state="in-flight"
          artUrl={donArtUrl ?? undefined}
          style={FILL_TRANSITION_FRAME}
        />
      ) : (
        <Card
          variant={variant}
          size={transition.spotlightSourceSize}
          state="in-flight"
          data={
            transition.cardId && transition.cardId !== "hidden"
              ? { cardId: transition.cardId, cardDb }
              : undefined
          }
          faceDown={isFaceDown}
          sleeveUrl={sleeveUrl}
          interaction={{ tooltipDisabled: true }}
          style={FILL_TRANSITION_FRAME}
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
  const readyTransitions = transitions.filter(
    (transition) => transition.waitForSpotlightId === undefined
  );
  if (readyTransitions.length === 0) return null;

  // The layer must escape any transformed parent so `position: fixed` resolves
  // to the viewport, not the scaled subtree (`<ScaledBoard>` applies
  // `transform: scale()`, which makes `fixed` behave like `absolute`). When a
  // `<PortalRoot>` is mounted by the shell (OPT-314/315), portal there;
  // otherwise render in place — the current layout has no transformed
  // ancestor for this layer, so this preserves today's behavior.
  const layer = (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      <AnimatePresence>
        {readyTransitions.map((t) => (
          <FlyingCard
            key={t.id}
            transition={t}
            cardDb={cardDb}
            onComplete={() => onComplete(t.id)}
            sleeveUrl={sleeveUrls?.[t.playerIndex] ?? null}
            donArtUrl={donArtUrls?.[t.playerIndex] ?? null}
            reducedMotion={reducedMotion ?? false}
          />
        ))}
      </AnimatePresence>
    </div>
  );

  const container = getPortalContainer();
  return container ? createPortal(layer, container) : layer;
});
