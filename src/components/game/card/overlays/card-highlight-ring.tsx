"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cardAttackerPulse, cardCounterPulse } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { HighlightRingColor } from "../types";

/**
 * Absolutely-positioned ring that sits above the 3D face stack. Consumers
 * request it via `overlays.highlightRing`, decoupling selection/validation
 * feedback from the underlying motion state.
 *
 * Ring → visual treatment map:
 *   selected → green static (blocker chosen, target-picker selection)
 *   valid    → amber static (drop-target affordance)
 *   blocker  → blue static (eligible but not yet chosen)
 *   attacker → amber pulse (OPT-273 attacker glow, sustained loop)
 *   defender → amber pulse (OPT-274 defender glow — same treatment as
 *              attacker so both participants in the active battle read as
 *              linked; kept as a separate color so future divergence
 *              doesn't require retrofitting consumers)
 *   counter  → amber flash (OPT-273 counter pulse, one-shot fade)
 *   invalid  → no ring (opacity dim lives in the state preset instead)
 */
export function CardHighlightRing({
  color,
  className,
}: {
  color: HighlightRingColor;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  if (color === "invalid") return null;

  if (color === "attacker" || color === "defender") {
    return (
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded",
          "ring-3 ring-gb-accent-amber",
          "shadow-[0_0_14px_var(--gb-accent-amber)]",
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
          "pointer-events-none absolute inset-0 z-10 rounded",
          "ring-3 ring-gb-accent-amber",
          "shadow-[0_0_18px_var(--gb-accent-amber)]",
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
      ? "ring-3 ring-gb-accent-green shadow-[0_0_10px_var(--gb-accent-green)]"
      : color === "blocker"
        ? "ring-3 ring-gb-accent-blue/60"
        : "ring-3 ring-gb-accent-amber/70";

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded",
        staticRingClass,
        className,
      )}
    />
  );
}
