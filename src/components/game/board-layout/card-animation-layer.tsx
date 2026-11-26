"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  animate,
  motion,
  motionValue,
  AnimatePresence,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import type { CardDb } from "@shared/game-types";
import type { CardTransition } from "@/hooks/use-card-transitions";
import { useZonePosition } from "@/contexts/zone-position-context";
import {
  flightDurationMs,
  flightPose,
  onNextFrame,
  planFlight,
} from "@/lib/game/card-motion";
import {
  cardFizzle,
  cardFizzleReduced,
  cardTransitions,
  cardTravel,
} from "@/lib/motion";
import { getPortalContainer } from "../scaled-board";
import { Card } from "../card";
import { CARD_SIZES } from "../card/sizes";
import {
  BOARD_CARD_W,
  BOARD_CARD_H,
  HAND_CARD_W,
  HAND_CARD_H,
} from "./constants";
import { handSlotZoneKey } from "./board-geometry";
import { isLookSlotZoneKey } from "@/lib/game/deck-look";

const DON_TOKEN_W = 50;
const DON_TOKEN_H = 70;
const FILL_TRANSITION_FRAME = { width: "100%", height: "100%" } as const;

interface CardAnimationLayerProps {
  transitions: CardTransition[];
  cardDb: CardDb;
  onComplete: (id: string) => void;
  sleeveUrls?: [string | null, string | null];
  donArtUrls?: [string | null, string | null];
  /** The board's CSS zoom. Ghosts render outside the zoomed board (in the
   *  portal), so board-card sizes are scaled to match the cards they leave
   *  and land on. Defaults to 1. */
  boardScale?: number;
}

interface GhostBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Usable when the registered element was measured while laid out. */
function measured(rect: DOMRect | null): rect is DOMRect {
  return !!rect && rect.width > 0 && rect.height > 0;
}

/**
 * A travelling card (OPT-1054): flips where it stands when its destination
 * needs the other side, then flies a shallow arc to its destination. The
 * pose is a pure function of eased progress (`flightPose`), and the
 * destination is re-read every frame, so a landing slot that is still
 * reflowing (a hand opening space for the drawn cards) pulls the card along
 * with it: the card lands exactly where its placeholder is, with no jump.
 */
function TravelGhost({
  transition,
  from,
  resolveTarget,
  variant,
  cardDb,
  sleeveUrl,
  onComplete,
  boardScale,
  profile,
  content,
}: {
  transition: CardTransition;
  from: GhostBox;
  resolveTarget: () => GhostBox;
  variant: "hand" | "field" | "modal";
  cardDb: CardDb;
  sleeveUrl?: string | null;
  onComplete: () => void;
  /** Viewport px per design px: distance, duration and arc use design px. */
  boardScale: number;
  /** A fixed duration and lower arc cap (DON!! tokens). */
  profile?: { durationMs: number; arcMaxPx: number };
  /** Replaces the travelling card (a DON!! token). */
  content?: React.ReactNode;
}) {
  const plan = planFlight(transition);
  const endRotate = transition.playedRested ? 90 : 0;
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const width = useMotionValue(from.w);
  const height = useMotionValue(from.h);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);
  // A card leaving the look fan stays invisible until its own start, while
  // its fan slot still shows it (OPT-1056).
  const hiddenUntil =
    transition.hiddenUntilDelay && (transition.delay ?? 0) > 0
      ? (transition.delay ?? 0)
      : 0;

  const resolveTargetRef = React.useRef(resolveTarget);
  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    resolveTargetRef.current = resolveTarget;
    onCompleteRef.current = onComplete;
  });

  React.useEffect(() => {
    const first = resolveTargetRef.current();
    const pxPerDesign = boardScale > 0 ? boardScale : 1;
    // The ghost layer sits outside the zoomed board: convert to design px.
    const distance = Math.hypot(first.x - from.x, first.y - from.y) / pxPerDesign;
    const geometry = { scale: pxPerDesign, arcMaxPx: profile?.arcMaxPx };
    const progress = motionValue(0);
    const apply = (p: number) => {
      const target = resolveTargetRef.current();
      const pose = flightPose(
        p,
        from,
        target,
        { from: 0, to: endRotate },
        false,
        geometry
      );
      x.set(pose.x);
      y.set(pose.y);
      width.set(from.w + (target.w - from.w) * p);
      height.set(from.h + (target.h - from.h) * p);
      rotate.set(pose.rotate);
      scale.set(pose.scale);
    };
    // Start the clock on the first frame after mount (as `CardFaces` does
    // for the flip), so a long commit cannot swallow the start of the move.
    let controls: { stop: () => void } | null = null;
    let cancelFollow = () => {};
    // After landing the ghost fades out over the card; it keeps following
    // the live slot so a hand still settling from its re-fan stays flush.
    const follow = () => {
      apply(1);
      cancelFollow = onNextFrame(follow);
    };
    const cancelStart = onNextFrame(() => {
      controls = animate(progress, 1, {
        duration: (profile?.durationMs ?? flightDurationMs(distance)) / 1000,
        ease: cardTravel.ease,
        delay: plan.departAt,
        onUpdate: apply,
        onComplete: () => {
          apply(1);
          onCompleteRef.current();
          // Without a frame clock (tests) there is nothing to follow.
          if (typeof requestAnimationFrame === "function") {
            cancelFollow = onNextFrame(follow);
          }
        },
      });
    });
    return () => {
      cancelStart();
      controls?.stop();
      cancelFollow();
    };
    // The flight is planned once, at mount; later renders only refresh the
    // target resolver through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      data-flight-id={transition.id}
      initial={hiddenUntil > 0 ? { opacity: 0 } : false}
      animate={{
        opacity: 1,
        transition: { duration: 0, delay: hiddenUntil },
      }}
      exit={{ opacity: 0 }}
      transition={cardTransitions.zoneExit}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        x,
        y,
        width,
        height,
        rotate,
        scale,
        pointerEvents: "none",
        // A card dealt from under a flipping pile top stays beneath it.
        zIndex: transition.flip === "under" ? 0 : 1,
      }}
    >
      {content ?? (
        <Card
          variant={variant}
          size={transition.spotlightSourceSize}
          state="in-flight"
          data={
            transition.cardId && transition.cardId !== "hidden"
              ? { cardId: transition.cardId, cardDb }
              : undefined
          }
          faceDown={plan.faceDown}
          flipFrom={
            plan.flipAt === null
              ? undefined
              : {
                  faceDown: plan.initialFaceDown,
                  delay: plan.flipAt,
                  instant: plan.flipInstant,
                }
          }
          sleeveUrl={sleeveUrl}
          interaction={{ tooltipDisabled: true }}
          style={FILL_TRANSITION_FRAME}
        />
      )}
    </motion.div>
  );
}

function FlyingCard({
  transition,
  cardDb,
  onComplete,
  sleeveUrl,
  donArtUrl,
  reducedMotion,
  boardScale,
}: {
  transition: CardTransition;
  cardDb: CardDb;
  onComplete: () => void;
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
  reducedMotion: boolean;
  boardScale: number;
}) {
  const zonePos = useZonePosition();
  const isTransform = transition.kind === "transform";
  const isDonAttach = transition.kind === "don-attach";
  const isFromHand = transition.fromZoneKey.endsWith("-hand");
  const isHandBound = transition.toZoneKey.endsWith("-hand");
  // Look fan slots (OPT-1056) are larger than board cards: flights into and
  // out of them take the slot's own footprint.
  const isFromLook = isLookSlotZoneKey(transition.fromZoneKey);
  const isLookBound = isLookSlotZoneKey(transition.toZoneKey);
  // A hand card's own slot is registered by `HandLayer`; a card that just
  // left the hand keeps its last measured slot. Prefer it over the hand
  // container so the card departs from (and lands in) its real place.
  const fromSlotRect =
    isFromHand && transition.instanceId
      ? zonePos.getRect(
          handSlotZoneKey(transition.fromZoneKey, transition.instanceId)
        )
      : null;
  const fromRect = measured(fromSlotRect)
    ? fromSlotRect
    : zonePos.getRect(transition.fromZoneKey);
  const toRect = zonePos.getRect(transition.toZoneKey);
  const canAnimate = Boolean(
    fromRect && (isTransform || toRect) && (!reducedMotion || isTransform)
  );

  // If we can't resolve both positions, clean up immediately
  React.useEffect(() => {
    if (!canAnimate) onComplete();
  }, [canAnimate, onComplete]);

  if (!canAnimate || !fromRect) return null;

  const isFromSpotlight = transition.spotlightSourceSize !== undefined;
  const destinationRect = toRect ?? fromRect;

  // Flight footprint depends on kind. DON tokens are smaller than cards and
  // stay DON-sized for the entire flight; card flights size to their
  // source/destination zone.
  //
  // A spotlight source takes its *logical* size token, not `fromRect`. The
  // registered spotlight element exits through `rotateY: 90` + `scale: 0.94`
  // (spotlight-overlay.tsx), and `getRect` reads a live
  // `getBoundingClientRect()`, so a dismissal sampled mid-exit measures a
  // collapsed, non-card-shaped box. The inner card is then forced to
  // 100%×100% of that box, which would paint the percentage radius as an
  // ellipse for the length of the flight. The token is the truth here: the
  // spotlight renders the card at exactly this size at rest.
  const spotlightSource = transition.spotlightSourceSize
    ? CARD_SIZES[transition.spotlightSourceSize]
    : null;
  const fromSlot =
    (measured(fromSlotRect) && fromRect === fromSlotRect) ||
    (isFromLook && measured(fromRect));
  const fromW = isDonAttach
    ? DON_TOKEN_W
    : spotlightSource
      ? spotlightSource.width
      : fromSlot
        ? fromRect.width
        : (isFromHand ? HAND_CARD_W : BOARD_CARD_W) * boardScale;
  const fromH = isDonAttach
    ? DON_TOKEN_H
    : spotlightSource
      ? spotlightSource.height
      : fromSlot
        ? fromRect.height
        : (isFromHand ? HAND_CARD_H : BOARD_CARD_H) * boardScale;
  const lookTarget = isLookBound && measured(toRect) ? toRect : null;
  const toW = isDonAttach
    ? DON_TOKEN_W
    : lookTarget
      ? lookTarget.width
      : (isHandBound ? HAND_CARD_W : BOARD_CARD_W) * boardScale;
  const toH = isDonAttach
    ? DON_TOKEN_H
    : lookTarget
      ? lookTarget.height
      : (isHandBound ? HAND_CARD_H : BOARD_CARD_H) * boardScale;

  const fromX = fromRect.left + (fromRect.width - fromW) / 2;
  const fromY = fromRect.top + (fromRect.height - fromH) / 2;
  // DON tokens aim for the target card's center.
  const toX = destinationRect.left + (destinationRect.width - toW) / 2;
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

  const delay = transition.delay ?? 0;

  if (!isTransform && !isDonAttach) {
    const toZoneKey = transition.toZoneKey;
    const instanceId = transition.instanceId;
    // Cards arriving in hand aim at their own placeholder slot, read live so
    // the card and the reflowing hand settle together. Without a slot, fall
    // back to the end of the hand fan.
    const resolveTarget = (): GhostBox => {
      if (isHandBound && instanceId) {
        const slot = zonePos.getRect(handSlotZoneKey(toZoneKey, instanceId));
        if (measured(slot)) {
          return { x: slot.left, y: slot.top, w: slot.width, h: slot.height };
        }
      }
      const rect = zonePos.getRect(toZoneKey) ?? destinationRect;
      return {
        x: isHandBound ? rect.right - toW : rect.left + (rect.width - toW) / 2,
        y: rect.top + (rect.height - toH) / 2,
        w: toW,
        h: toH,
      };
    };
    return (
      <TravelGhost
        transition={transition}
        from={{ x: fromX, y: fromY, w: fromW, h: fromH }}
        resolveTarget={resolveTarget}
        variant={variant === "don" ? "field" : variant}
        cardDb={cardDb}
        sleeveUrl={sleeveUrl}
        onComplete={onComplete}
        boardScale={boardScale}
      />
    );
  }

  if (isDonAttach) {
    // DON!! tokens fly the shared arc at a fixed pace with a lower cap
    // (OPT-1054), aimed at the target card's center.
    return (
      <TravelGhost
        transition={transition}
        from={{ x: fromX, y: fromY, w: fromW, h: fromH }}
        resolveTarget={() => ({ x: toX, y: toY, w: toW, h: toH })}
        variant="field"
        cardDb={cardDb}
        onComplete={onComplete}
        boardScale={boardScale}
        profile={cardTransitions.donAttach}
        content={
          <Card
            variant="don"
            state="in-flight"
            artUrl={donArtUrl ?? undefined}
            style={FILL_TRANSITION_FRAME}
          />
        }
      />
    );
  }

  // Transform-class cards dissolve at the source. Destination pile receipt
  // is owned by the pile components after this transition completes.
  const fizzle = reducedMotion ? cardFizzleReduced : cardFizzle;
  const animateTarget = {
    x: fromX,
    y: reducedMotion ? fromY : cardFizzle.y.map((offset) => fromY + offset),
    width: fromW,
    height: fromH,
    scale: reducedMotion ? 1 : [...cardFizzle.scale],
    opacity: [...fizzle.opacity],
  };
  const transitionConfig = { ...fizzle.transition, delay };

  const isFaceDown = !transition.cardId || transition.cardId === "hidden";

  return (
    <motion.div
      initial={{
        rotate: 0,
        x: fromX,
        y: fromY,
        width: fromW,
        height: fromH,
        opacity: 1,
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
    </motion.div>
  );
}

export const CardAnimationLayer = React.memo(function CardAnimationLayer({
  transitions,
  cardDb,
  onComplete,
  sleeveUrls,
  donArtUrls,
  boardScale = 1,
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
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999]"
    >
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
            boardScale={boardScale}
          />
        ))}
      </AnimatePresence>
    </div>
  );

  const container = getPortalContainer();
  return container ? createPortal(layer, container) : layer;
});
