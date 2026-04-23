import type { Transition, TargetAndTransition } from "motion/react";
import {
  cardActivate,
  cardBreathing,
  cardHover,
  cardRest,
  cardTap,
  cardTapReduced,
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
 * @param delay optional delay (seconds) merged into the state transition,
 *   for staggered board updates (e.g. refresh-wave on a character row)
 */
export function stateToMotionConfig(
  state: CardState,
  variant: CardVariant,
  reducedMotion: boolean,
  delay?: number,
): CardMotionConfig {
  const hover = variantHover(variant);
  const tap = variantTap(variant, reducedMotion);
  const withDelay = (t: Transition): Transition =>
    delay != null ? { ...t, delay } : t;

  switch (state) {
    case "rest":
      // Game-RESTED position: rotated 90°, dimmed.
      return {
        animate: { rotate: 90, opacity: 1, filter: "brightness(0.6)" },
        transition: withDelay(cardRest),
        whileHover: reducedMotion ? undefined : hover,
        whileTap: tap,
      };
    case "active":
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: withDelay(cardActivate),
        whileHover: reducedMotion ? undefined : hover,
        whileTap: tap,
      };
    case "selected":
      // Upright + subtle lift; highlight ring renders separately via overlays.
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: withDelay(cardActivate),
        whileHover: reducedMotion ? undefined : hover,
        whileTap: tap,
      };
    case "invalid":
      // Target picker: card exists but is not a legal choice. Dimmed only —
      // no filter tint (no gradient effect) and no ring (no stroke).
      return {
        animate: { rotate: 0, opacity: 0.35, filter: "brightness(1)" },
        transition: withDelay(cardRest),
        whileHover: undefined,
        whileTap: undefined,
      };
    case "dragging":
      // Origin stays visually intact during drag — the consumer's dnd-kit
      // overlay owns the "card follows cursor" visual. Suppressing hover/tap
      // is enough; don't dim or tint.
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: withDelay(cardRest),
        whileHover: undefined,
        whileTap: undefined,
      };
    case "in-flight":
      // Position/scale driven externally by the flight layer.
      return {
        animate: { rotate: 0, opacity: 1, filter: "brightness(1)" },
        transition: withDelay(cardActivate),
        whileHover: undefined,
        whileTap: undefined,
      };
  }
}

function variantHover(variant: CardVariant): TargetAndTransition {
  return variant === "hand" ? handCardHover : cardHover;
}

function variantTap(
  variant: CardVariant,
  reducedMotion: boolean,
): TargetAndTransition | undefined {
  // Hand cards use lift-hover only (no squish-tap) to match existing handCardHover feel.
  if (variant === "hand") return undefined;
  // Under reduced-motion the 3D dip (rotateX) is suppressed but a simple
  // scale tap remains, per OPT-275 spec.
  return reducedMotion ? cardTapReduced : cardTap;
}

/**
 * Ambient "card feels alive" idle loop (Balatro-style). Disabled on:
 * `prefers-reduced-motion`, face-down cards, non-focal zones (trash /
 * life / DON tokens), and non-idle states (rest / invalid / dragging /
 * in-flight). When disabled, the layer still renders but animates once
 * to a baseline — no infinite loop cost.
 */
export function idleBreathingConfig(
  state: CardState,
  variant: CardVariant,
  faceDown: boolean | undefined,
  reducedMotion: boolean,
): { animate: TargetAndTransition; transition: Transition } | undefined {
  if (reducedMotion) return undefined;
  if (faceDown) return undefined;
  if (state !== "active" && state !== "selected") return undefined;
  if (variant === "trash" || variant === "life" || variant === "don") {
    return undefined;
  }
  const { transition, ...animate } = cardBreathing;
  return { animate, transition };
}

/**
 * Resolve the 3D rotateY angle for the face-down flip. Consumers pass
 * `faceDown` — the primitive turns that into a rotation driven by the same
 * `motion` system so the flip composes with other state changes.
 */
export function faceDownRotateY(faceDown: boolean | undefined): number {
  return faceDown ? 180 : 0;
}
