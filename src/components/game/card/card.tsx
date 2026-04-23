"use client";

import React from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { cn } from "@/lib/utils";
import { CardTooltip } from "../use-card-tooltip";
import { CardBack } from "./card-back";
import { CardFaces } from "./card-faces";
import { CardFront } from "./card-front";
import { CardCountBadge } from "./overlays/card-count-badge";
import { CardDonBadge } from "./overlays/card-don-badge";
import { CardHighlightRing } from "./overlays/card-highlight-ring";
import { PerspectiveContainer } from "./perspective-container";
import { resolveSize } from "./sizes";
import { idleBreathingConfig, stateToMotionConfig } from "./state-presets";
import type { CardProps } from "./types";

/** Max pointer-tilt deflection in degrees (OPT-275). Stays inside the
 *  ticket's 10–15° target; further composes with the outer state rotation. */
const TILT_MAX_DEG = 12;

/** Spring for the pointer-driven tilt motion values. Gentle enough that a
 *  fast flick reads as a smooth lean, stiff enough that leaving the card
 *  snaps back promptly. */
const TILT_SPRING = { stiffness: 220, damping: 22, mass: 0.6 } as const;

/** Used when idle breathing is disabled for a given card — animate once to
 *  baseline, then stay put. No infinite loop cost. */
const BREATHING_BASELINE = { y: 0, scale: 1 };
const BREATHING_BASELINE_TRANSITION = { duration: 0 };

/**
 * `<Card>` — unified primitive for every game card rendering surface.
 *
 * - 3D DOM structure (perspective + preserve-3d + front/back faces) is baked
 *   in from day one. Both faces always mounted — `faceDown` is a state, not
 *   a separate render path. This is the foundation that lets OPT-276 add the
 *   flip animation without a retrofit.
 * - State → motion-preset mapping lives in `state-presets.ts`; consumers
 *   pass a semantic `state` and the primitive picks the right springs.
 * - dnd-kit, zone registration, and external flight positioning stay in
 *   consumer wrappers — the primitive is a rendering + motion concern only.
 */
export const Card = React.memo(function Card({
  data,
  variant,
  state = "active",
  size,
  faceDown,
  sleeveUrl,
  artUrl,
  interaction,
  overlays,
  empty,
  emptyLabel,
  motionDelay,
  className,
  style,
  onClick,
}: CardProps) {
  const reducedMotion = useReducedMotion();
  const { width, height } = resolveSize(variant, size);

  // All hooks must run in a stable order on every render — keep them above
  // the `empty` short-circuit. Computations that depend on props the empty
  // path doesn't use are cheap and harmless to run anyway.
  const motionConfig = stateToMotionConfig(
    state,
    variant,
    reducedMotion ?? false,
    motionDelay,
  );

  const breathing = idleBreathingConfig(
    state,
    variant,
    faceDown,
    reducedMotion ?? false,
  );

  // Pointer-driven 3D tilt (OPT-275). Raw motion values track the pointer
  // directly; a spring smooths them into the inline `rotateX/rotateY`. The
  // spring also owns the ease-back-to-zero when the pointer leaves — no
  // imperative animation needed.
  //
  // Tilt composes with the outer state rotation via perspective-preserve-3d,
  // so a rested card (rotateZ 90°) still leans toward the cursor correctly.
  const tiltXRaw = useMotionValue(0);
  const tiltYRaw = useMotionValue(0);
  const tiltX = useSpring(tiltXRaw, TILT_SPRING);
  const tiltY = useSpring(tiltYRaw, TILT_SPRING);
  const tiltEnabled = !reducedMotion && motionConfig.whileHover !== undefined;
  const interactionRef = React.useRef<HTMLDivElement>(null);

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!tiltEnabled || !interactionRef.current) return;
      const rect = interactionRef.current.getBoundingClientRect();
      const dx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const dy = (e.clientY - rect.top) / rect.height - 0.5;
      // dy<0 (pointer above center) → rotateX<0 → top of card leans toward
      // the viewer. dx>0 (pointer right) → rotateY<0 → right edge toward
      // viewer. In CSS left-handed 3D space, negative angles on these axes
      // produce the "follow-pointer" Balatro tilt.
      tiltXRaw.set(dy * 2 * TILT_MAX_DEG);
      tiltYRaw.set(-dx * 2 * TILT_MAX_DEG);
    },
    [tiltEnabled, tiltXRaw, tiltYRaw],
  );

  const handlePointerLeave = React.useCallback(() => {
    tiltXRaw.set(0);
    tiltYRaw.set(0);
  }, [tiltXRaw, tiltYRaw]);

  // Empty placeholder short-circuits the 3D stack — nothing to flip, no
  // motion needed.
  if (empty) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "flex items-center justify-center rounded border border-dashed",
          "border-gb-border-strong/30 bg-gb-board/50",
          interaction?.clickable && "cursor-pointer",
          className,
        )}
        style={{ width, height, ...style }}
      >
        {(emptyLabel ?? overlays?.label) && (
          <span className="select-none text-xs uppercase tracking-wider leading-tight text-center text-gb-text-dim/50">
            {emptyLabel ?? overlays?.label}
          </span>
        )}
      </div>
    );
  }

  const resolvedCardId = data?.card?.cardId ?? data?.cardId;
  const cardData =
    resolvedCardId && data?.cardDb ? data.cardDb[resolvedCardId] ?? null : null;

  // Counter-rotation keeps the count badge label horizontal even when the
  // card itself is rotated (e.g. state=`rest` → 90°). The count badge lives
  // inside the rotating layer so it pins to a card-local corner; its
  // *content* rotates the opposite way so text stays upright.
  const cardRotate =
    typeof motionConfig.animate.rotate === "number"
      ? motionConfig.animate.rotate
      : 0;
  const counterRotate = -cardRotate;

  const cardElement = (
    <PerspectiveContainer
      width={width}
      height={height}
      className={className}
      style={style}
      onClick={onClick}
    >
      {/* Outer layer owns state rotation (rest = 90°) / opacity / filter.
          Nesting the interaction layer inside means hover/tap transforms
          *compose* with state rotation instead of overwriting it — so a
          rested card wiggles around 90°, not 0°. */}
      <motion.div
        className="absolute inset-0 rounded"
        animate={motionConfig.animate}
        transition={motionConfig.transition}
      >
        {/* Breathing layer (OPT-275): passive idle drift + scale pulse.
            Always mounted so the DOM tree is stable across state changes —
            when breathing is disabled (non-focal zones, face-down, reduced
            motion, non-idle states) the layer animates once to baseline and
            stays put. */}
        <motion.div
          className="absolute inset-0 rounded"
          animate={breathing?.animate ?? BREATHING_BASELINE}
          transition={breathing?.transition ?? BREATHING_BASELINE_TRANSITION}
        >
          {/* Interaction layer: scale spring + wiggle keyframes spring *in*
              via whileHover; all interaction transforms tween *out* via this
              default transition so hover-off/tap-off don't inherit the
              state-change spring and bounce back. Pointer-driven tilt values
              ride on `style` (motion values) so they compose cleanly with
              `whileHover` / `whileTap` on independent transform axes. */}
          <motion.div
            ref={interactionRef}
            className={cn(
              "absolute inset-0 rounded will-change-transform",
              interaction?.clickable && "cursor-pointer",
            )}
            transition={{ duration: 0.15, ease: "easeOut" as const }}
            whileHover={motionConfig.whileHover}
            whileTap={motionConfig.whileTap}
            style={{ rotateX: tiltX, rotateY: tiltY }}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <CardFaces faceDown={!!faceDown}>
              <CardFront
                data={cardData}
                fallbackLabel={overlays?.label}
                imageUrlOverride={artUrl}
              />
              <CardBack sleeveUrl={sleeveUrl} label={overlays?.label} />
            </CardFaces>

            {/* Highlight ring follows the card outline, so it sits inside the
                rotating layer without any counter-rotation. */}
            {overlays?.highlightRing && (
              <CardHighlightRing color={overlays.highlightRing} />
            )}

            {/* Count badge: rides with the card face, counter-rotated so its
                label stays horizontal regardless of card rotation. Stacked-zone
                cards (life, deck, trash) don't rest, so pinning to a card-local
                corner is fine here. */}
            {overlays?.countBadge != null && (
              <motion.div
                className={cn(
                  "absolute z-10",
                  faceDown ? "bottom-1 right-1" : "top-1 right-1",
                )}
                animate={{ rotate: counterRotate }}
                transition={motionConfig.transition}
              >
                <CardCountBadge count={overlays.countBadge} />
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* DON badge lives outside the rotating layer so it can track the
          card's *visible* bottom-right — not a card-local corner that
          spins with the card. For rest (90° CW), the visible BR sits at
          container-local ((W+H)/2, (W+H)/2), so the right/bottom insets
          shift by (W-H)/2 and (H-W)/2. No counter-rotation needed —
          the badge is never rotated in the first place. */}
      {overlays?.donCount != null && (
        <motion.div
          className="absolute z-10"
          initial={false}
          animate={{
            right: state === "rest" ? (width - height) / 2 + 4 : 4,
            bottom: state === "rest" ? (height - width) / 2 + 4 : 4,
          }}
          transition={motionConfig.transition}
        >
          <CardDonBadge count={overlays.donCount} />
        </motion.div>
      )}
    </PerspectiveContainer>
  );

  const tooltipEligible =
    !!cardData && !faceDown && !interaction?.tooltipDisabled;

  if (!tooltipEligible) return cardElement;

  return (
    <CardTooltip data={cardData} cardId={resolvedCardId} card={data?.card}>
      {cardElement}
    </CardTooltip>
  );
});
