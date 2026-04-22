"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
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
import { stateToMotionConfig } from "./state-presets";
import type { CardProps } from "./types";

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

  // Empty placeholder short-circuits the 3D stack — nothing to flip, no
  // motion needed. Matches the old `BoardCard empty` code path.
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

  const resolvedCardId = data.card?.cardId ?? data.cardId;
  const cardData = resolvedCardId ? data.cardDb[resolvedCardId] ?? null : null;

  const motionConfig = stateToMotionConfig(
    state,
    variant,
    reducedMotion ?? false,
    motionDelay,
  );

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
        {/* Interaction layer: scale spring + wiggle keyframes spring *in*
            via whileHover; all interaction transforms tween *out* via this
            default transition so hover-off/tap-off don't inherit the
            state-change spring and bounce back. */}
        <motion.div
          className={cn(
            "absolute inset-0 rounded",
            interaction?.clickable && "cursor-pointer",
          )}
          transition={{ duration: 0.15, ease: "easeOut" as const }}
          whileHover={motionConfig.whileHover}
          whileTap={motionConfig.whileTap}
        >
          <CardFaces faceDown={!!faceDown} transition={motionConfig.transition}>
            <CardFront data={cardData} fallbackLabel={overlays?.label} />
            <CardBack sleeveUrl={sleeveUrl} />
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
    <CardTooltip data={cardData} cardId={resolvedCardId} card={data.card}>
      {cardElement}
    </CardTooltip>
  );
});
