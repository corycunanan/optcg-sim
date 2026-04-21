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
  );

  const cardElement = (
    <PerspectiveContainer
      width={width}
      height={height}
      className={className}
      style={style}
      onClick={onClick}
    >
      <motion.div
        className={cn(
          "absolute inset-0 rounded",
          interaction?.clickable && "cursor-pointer",
        )}
        animate={motionConfig.animate}
        transition={motionConfig.transition}
        whileHover={motionConfig.whileHover}
        whileTap={motionConfig.whileTap}
      >
        <CardFaces faceDown={!!faceDown} transition={motionConfig.transition}>
          <CardFront data={cardData} fallbackLabel={overlays?.label} />
          <CardBack
            sleeveUrl={sleeveUrl}
            showSleeveArt={variant !== "deck-back"}
          />
        </CardFaces>

        {/* Overlays render above the 3D stack so they remain visible mid-flip. */}
        {overlays?.highlightRing && (
          <CardHighlightRing color={overlays.highlightRing} />
        )}
        {overlays?.countBadge != null && (
          <CardCountBadge
            count={overlays.countBadge}
            position={faceDown ? "bottom-right" : "top-right"}
          />
        )}
        {overlays?.donCount != null && (
          <CardDonBadge count={overlays.donCount} />
        )}
      </motion.div>
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
