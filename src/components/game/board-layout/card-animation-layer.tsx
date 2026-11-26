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
  donReturnFlight,
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
  /** Field cards shown rested. A DON!! token hides under the card's real
   *  footprint, which turns sideways when the card is rested (OPT-1058). */
  restedInstanceIds?: ReadonlySet<string>;
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

/** A field card's visible footprint inside its square slot: a portrait
 *  board card, turned sideways when the card is rested. */
export function cardFootprint(
  slot: { left: number; top: number; width: number; height: number },
  rested: boolean,
  boardScale: number
): GhostBox {
  const w = (rested ? BOARD_CARD_H : BOARD_CARD_W) * boardScale;
  const h = (rested ? BOARD_CARD_W : BOARD_CARD_H) * boardScale;
  return {
    x: slot.left + (slot.width - w) / 2,
    y: slot.top + (slot.height - h) / 2,
    w,
    h,
  };
}

/** The live rect of one DON!! in a cost area (each renders with
 *  `data-don-instance-id`). */
function donSlotRect(instanceId: string): DOMRect | null {
  if (typeof document === "undefined") return null;
  const node = document.querySelector(
    `[data-don-instance-id="${CSS.escape(instanceId)}"]`
  );
  const rect = node?.getBoundingClientRect() ?? null;
  return measured(rect) ? rect : null;
}

/** `clip-path` for a full-viewport layer that cuts out `hole`, so what the
 *  layer draws passes beneath that box (OPT-1058). */
export function clipOutside(hole: GhostBox): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  // A frame far larger than any viewport, with the hole wound inside it.
  const outer = "M-10000 -10000H20000V20000H-10000Z";
  const inner =
    `M${r(hole.x)} ${r(hole.y)}h${r(hole.w)}v${r(hole.h)}h${r(-hole.w)}Z`;
  return `path(evenodd, "${outer} ${inner}")`;
}

/** Draws its children beneath a field card: everything inside `rect` is
 *  clipped away, so a DON!! token slides under the card's edge. */
function BeneathCard({
  rect,
  children,
}: {
  rect: GhostBox;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ clipPath: clipOutside(rect) }}
    >
      {children}
    </div>
  );
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
  endRotate: endRotateOverride,
  lean = true,
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
  /** Landing rotation; defaults to the played card's orientation. */
  endRotate?: number;
  /** Lean toward the travel direction (off for a token turning rested). */
  lean?: boolean;
}) {
  const plan = planFlight(transition);
  const endRotate = endRotateOverride ?? (transition.playedRested ? 90 : 0);
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const width = useMotionValue(from.w);
  const height = useMotionValue(from.h);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);

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
    const geometry = { scale: pxPerDesign, arcMaxPx: profile?.arcMaxPx, lean };
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
  restedInstanceIds,
}: {
  transition: CardTransition;
  cardDb: CardDb;
  onComplete: () => void;
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
  reducedMotion: boolean;
  boardScale: number;
  restedInstanceIds?: ReadonlySet<string>;
}) {
  const zonePos = useZonePosition();
  const isTransform = transition.kind === "transform";
  const isDonReturn = transition.kind === "don-return";
  const isDonAttach = transition.kind === "don-attach" || isDonReturn;
  const isFromHand = transition.fromZoneKey.endsWith("-hand");
  const isHandBound = transition.toZoneKey.endsWith("-hand");
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

  if (isDonAttach) {
    // DON!! tokens fly the shared arc at a fixed pace with a lower cap
    // (OPT-1054). A given DON!! slides under its card: it is clipped out
    // wherever it overlaps the card, so it disappears beneath the card's
    // edge (OPT-1058). A Refresh return slides out from under its card the
    // same way, to its own slot in the cost area, and lands rested.
    const cardRect = isDonReturn ? fromRect : destinationRect;
    const cardRested =
      !!transition.targetInstanceId &&
      !!restedInstanceIds?.has(transition.targetInstanceId);
    const tokenW = DON_TOKEN_W * boardScale;
    const tokenH = DON_TOKEN_H * boardScale;
    const centered = (rect: DOMRect): GhostBox => ({
      x: rect.left + (rect.width - tokenW) / 2,
      y: rect.top + (rect.height - tokenH) / 2,
      w: tokenW,
      h: tokenH,
    });
    const resolveTarget = isDonReturn
      ? () => {
          // The returning DON!! renders hidden in its cost-area slot until
          // it lands; aim at that slot (read live, as the area re-fans).
          const slot = transition.instanceId
            ? donSlotRect(transition.instanceId)
            : null;
          return slot ? centered(slot) : centered(destinationRect);
        }
      : () => centered(destinationRect);
    return (
      <BeneathCard
        rect={cardFootprint(cardRect, cardRested, boardScale)}
      >
        <TravelGhost
          transition={transition}
          from={centered(fromRect)}
          resolveTarget={resolveTarget}
          variant="field"
          cardDb={cardDb}
          onComplete={onComplete}
          boardScale={boardScale}
          profile={isDonReturn ? donReturnFlight : cardTransitions.donAttach}
          endRotate={isDonReturn ? 90 : 0}
          lean={!isDonReturn}
          content={
            <Card
              variant="don"
              state="in-flight"
              artUrl={donArtUrl ?? undefined}
              style={FILL_TRANSITION_FRAME}
            />
          }
        />
      </BeneathCard>
    );
  }


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
  const fromSlot = measured(fromSlotRect) && fromRect === fromSlotRect;
  const fromW = spotlightSource
      ? spotlightSource.width
      : fromSlot
        ? fromRect.width
        : (isFromHand ? HAND_CARD_W : BOARD_CARD_W) * boardScale;
  const fromH = spotlightSource
      ? spotlightSource.height
      : fromSlot
        ? fromRect.height
        : (isFromHand ? HAND_CARD_H : BOARD_CARD_H) * boardScale;
  const toW = (isHandBound ? HAND_CARD_W : BOARD_CARD_W) * boardScale;
  const toH = (isHandBound ? HAND_CARD_H : BOARD_CARD_H) * boardScale;

  const fromX = fromRect.left + (fromRect.width - fromW) / 2;
  const fromY = fromRect.top + (fromRect.height - fromH) / 2;

  // Variant tracks the destination footprint — the primitive's size token
  // matches the outer motion.div's animated `toW/toH` so the card settles
  // into the destination zone at exactly the right dimensions.
  const variant = isFromSpotlight
      ? "modal"
      : isHandBound
        ? "hand"
        : "field";

  const delay = transition.delay ?? 0;

  if (!isTransform) {
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
        variant={variant}
        cardDb={cardDb}
        sleeveUrl={sleeveUrl}
        onComplete={onComplete}
        boardScale={boardScale}
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
  restedInstanceIds,
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
            restedInstanceIds={restedInstanceIds}
          />
        ))}
      </AnimatePresence>
    </div>
  );

  const container = getPortalContainer();
  return container ? createPortal(layer, container) : layer;
});
