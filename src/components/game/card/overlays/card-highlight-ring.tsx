"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  cardAttackerPulse,
  cardCounterPulse,
  cardWinnerPulse,
  negatedRing,
  redirectedSweep,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { HighlightRingColor } from "../types";

/**
 * Absolutely-positioned ring that sits above the 3D face stack. Consumers
 * request it via `overlays.highlightRing`, decoupling selection/validation
 * feedback from the underlying motion state.
 *
 * Every variant carries `rounded-card`: the ring is `inset-0` over the card
 * box, and `ring-*` is a `box-shadow` generated from the border box, so its
 * corner is only ever as right as the radius it traces. It moves with the rest
 * of the card stack in `card.tsx` (SHAPE-LANGUAGE.md §The card radius).
 *
 * Ring → visual treatment map:
 *   selected → green static (blocker chosen, target-picker selection)
 *   eligible → blue static (eligible but not yet chosen)
 *   attacker → amber pulse (OPT-273 attacker glow, sustained loop)
 *   defender → amber pulse (OPT-274 defender glow — same treatment as
 *              attacker so both participants in the active battle read as
 *              linked; kept as a separate color so future divergence
 *              doesn't require retrofitting consumers)
 *   counter  → amber flash (OPT-273 counter pulse, one-shot fade)
 *   winner   → green pulse (OPT-283 combat victory, one-shot; the field-card
 *              wrapper owns the card recoil so the art and ring move together)
 *   redirected → amber left-to-right sweep (OPT-284, one-shot)
 *   negated  → desaturated gray contraction (OPT-284, one-shot)
 *   usable-effect → gold static (ambient server-computed effect availability)
 *   invalid  → no ring (opacity dim lives in the state preset instead)
 */
export function resolveCardHighlightRingColor(
  activeRing: HighlightRingColor | undefined,
  hasUsableEffect: boolean,
): HighlightRingColor | undefined {
  return activeRing ?? (hasUsableEffect ? "usable-effect" : undefined);
}

export function CardHighlightRing({
  color,
  className,
}: {
  color?: HighlightRingColor;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  if (!color || color === "invalid") return null;

  if (color === "winner") {
    if (reducedMotion) return null;

    return (
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-card",
          "ring-4 ring-gb-signal-selected",
          "shadow-[0_0_18px_var(--gb-signal-selected)]",
          className,
        )}
        initial={{ opacity: 0, scale: 1 }}
        animate={{
          opacity: cardWinnerPulse.opacity,
          scale: cardWinnerPulse.scale,
        }}
        transition={cardWinnerPulse.transition}
      />
    );
  }

  if (color === "redirected") {
    if (reducedMotion) return null;

    return (
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-card",
          "ring-4 ring-gb-signal-battle",
          "shadow-[0_0_18px_var(--gb-signal-battle)]",
          className,
        )}
        initial={{ opacity: 0, scale: 1, clipPath: "inset(0 100% 0 0)" }}
        animate={{
          opacity: redirectedSweep.opacity,
          scale: redirectedSweep.scale,
          clipPath: redirectedSweep.clipPath,
        }}
        transition={redirectedSweep.transition}
      />
    );
  }

  if (color === "negated") {
    if (reducedMotion) return null;

    return (
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-card",
          "ring-4 ring-gb-signal-disabled/70",
          "shadow-[0_0_12px_var(--gb-signal-disabled)]",
          className,
        )}
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{
          opacity: negatedRing.opacity,
          scale: negatedRing.scale,
        }}
        transition={negatedRing.transition}
      />
    );
  }

  if (color === "attacker" || color === "defender") {
    return (
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-card",
          "ring-4 ring-gb-signal-battle",
          "shadow-[0_0_14px_var(--gb-signal-battle)]",
          className,
        )}
        initial={{ opacity: reducedMotion ? 1 : 0.6, scale: 1 }}
        animate={
          reducedMotion
            ? { opacity: 1, scale: 1 }
            : {
                opacity: cardAttackerPulse.opacity,
                scale: cardAttackerPulse.scale,
              }
        }
        transition={reducedMotion ? { duration: 0 } : cardAttackerPulse.transition}
      />
    );
  }

  if (color === "counter") {
    return (
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-card",
          "ring-4 ring-gb-signal-battle",
          "shadow-[0_0_18px_var(--gb-signal-battle)]",
          className,
        )}
        initial={{ opacity: 0, scale: 1 }}
        animate={
          reducedMotion
            ? { opacity: 1, scale: 1 }
            : {
                opacity: cardCounterPulse.opacity,
                scale: cardCounterPulse.scale,
              }
        }
        transition={reducedMotion ? { duration: 0 } : cardCounterPulse.transition}
      />
    );
  }

  const staticRingClass =
    color === "selected"
      ? "ring-4 ring-gb-signal-selected shadow-[0_0_10px_var(--gb-signal-selected)]"
      : color === "usable-effect"
        ? "ring-4 ring-gold-500"
        : "ring-4 ring-gb-signal-eligible/60";

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded-card",
        staticRingClass,
        className,
      )}
    />
  );
}
