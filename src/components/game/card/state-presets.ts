import type { Transition, TargetAndTransition } from "motion/react";
import {
  cardActivate,
  cardHover,
  cardRest,
  cardTap,
  handCardHover,
} from "@/lib/motion";
import type { CardState, CardVariant } from "./types";

/**
 * Pure mapping from the public `state` + `variant` props to motion.dev
 * configuration. Lives in its own module so it can be unit-tested without
 * a DOM — the primitive simply wires these return values into `<motion.div>`.
 *
 * No new animations introduced here (per OPT-266 scope). Existing presets
 * from `src/lib/motion.ts` are exposed via the `state` enum.
 */

export interface CardMotionConfig {
  /** `animate` target — rotation, opacity, filter. */
  animate: TargetAndTransition;
  /** `transition` — which spring / easing drives `animate`. */
  transition: Transition;
  /** `whileHover` target (undefined when suppressed). */
  whileHover: TargetAndTransition | undefined;
  /** `whileTap` target (undefined when suppressed). */
  whileTap: TargetAndTransition | undefined;
}

/**
 * Resolve motion config for a given state + variant pair.
 *
 * @param state visual state enum
 * @param variant consumer domain (drives which hover preset is used)
 * @param reducedMotion true when the user has `prefers-reduced-motion`
 */
export function stateToMotionConfig(
  state: CardState,
  variant: CardVariant,
  reducedMotion: boolean,
): CardMotionConfig {
  const hover = variantHover(variant);
  const tap = variantTap(variant);

  switch (state) {
    case "rest":
      // Game-RESTED position: rotated 90°, dimmed.
      return {
        animate: { rotate: 90, opacity: 1, filter: "brightness(0.6)" },
        transition: cardRest,
        whileHover: reducedMotion ? undefined : hover,
        whileTap: reducedMotion ? undefined : tap,
      };
    case "active":
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: cardActivate,
        whileHover: reducedMotion ? undefined : hover,
        whileTap: reducedMotion ? undefined : tap,
      };
    case "selected":
      // Upright + subtle lift; highlight ring renders separately via overlays.
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: cardActivate,
        whileHover: reducedMotion ? undefined : hover,
        whileTap: reducedMotion ? undefined : tap,
      };
    case "invalid":
      // Target picker: card exists but is not a legal choice.
      return {
        animate: { rotate: 0, opacity: 0.35, filter: "grayscale(0.4)" },
        transition: cardRest,
        whileHover: undefined,
        whileTap: undefined,
      };
    case "dragging":
      // Consumer's drag overlay is authoritative — fade the origin.
      return {
        animate: { rotate: 0, opacity: 0.3, filter: "brightness(1)" },
        transition: cardRest,
        whileHover: undefined,
        whileTap: undefined,
      };
    case "in-flight":
      // Position/scale driven externally by the flight layer.
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: cardActivate,
        whileHover: undefined,
        whileTap: undefined,
      };
  }
}

function variantHover(variant: CardVariant): TargetAndTransition {
  return variant === "hand" ? handCardHover : cardHover;
}

function variantTap(variant: CardVariant): TargetAndTransition | undefined {
  // Hand cards use lift-hover only (no squish-tap) to match existing handCardHover feel.
  return variant === "hand" ? undefined : cardTap;
}

/**
 * Resolve the 3D rotateY angle for the face-down flip. Consumers pass
 * `faceDown` — the primitive turns that into a rotation driven by the same
 * `motion` system so the flip composes with other state changes.
 */
export function faceDownRotateY(faceDown: boolean | undefined): number {
  return faceDown ? 180 : 0;
}
