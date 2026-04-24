import type { Transition, TargetAndTransition } from "motion/react";
import {
  cardActivate,
  cardBlockerHighlight,
  cardBreathing,
  cardFlip,
  cardHover,
  cardKO,
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
    case "attacking":
      // Attacker is always game-RESTED (declaring an attack rests the card).
      // Rotation matches `rest`; the ring pulse is handled via
      // `overlays.highlightRing="attacker"` on a separate layer so motion
      // composes cleanly with the rotation.
      return {
        animate: { rotate: 90, opacity: 1, filter: "brightness(1)" },
        transition: withDelay(cardActivate),
        whileHover: reducedMotion ? undefined : hover,
        whileTap: tap,
      };
    case "blocking":
      // Blocker selected by the defender. Card must be ACTIVE to block,
      // so rotation is 0°. A brief spring pop (cardBlockerHighlight) rides
      // the transition in; under reduced-motion it collapses to the plain
      // activate spring.
      return {
        animate: reducedMotion
          ? { rotate: 0, opacity: 1, filter: "brightness(1)" }
          : {
              rotate: 0,
              opacity: 1,
              filter: "brightness(1.08)",
              scale: cardBlockerHighlight.scale,
              y: cardBlockerHighlight.y,
            },
        transition: withDelay(
          reducedMotion ? cardActivate : cardBlockerHighlight.transition,
        ),
        whileHover: reducedMotion ? undefined : hover,
        whileTap: tap,
      };
    case "kod":
      // KO shrink — applied to the flight ghost at the source zone before
      // the flight layer animates it away. Scale + opacity keyframes dip
      // and recover. Reduced-motion collapses to an instant swap.
      return {
        animate: reducedMotion
          ? { rotate: 0, opacity: 1, filter: "brightness(1)", scale: 1 }
          : {
              rotate: 0,
              opacity: cardKO.opacity,
              filter: "brightness(1)",
              scale: cardKO.scale,
            },
        transition: withDelay(
          reducedMotion ? { duration: 0 } : cardKO.transition,
        ),
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
  // Non-idle states skip breathing. `attacking` is rested (90°) so its
  // breathing y-axis would translate horizontally — the attacker ring pulse
  // carries the "alive" feel instead. `blocking` has its own one-shot pop
  // on transition and reverts to the standard idle once settled, so it
  // stays out here too to avoid stacking motion on top of a spring pop.
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

/**
 * Transition used by the face-up ↔ face-down flip (OPT-276). The flip has
 * its own spring (`cardFlip`) so it doesn't inherit the ambient state
 * transition — a rested card flipping face-up shouldn't borrow `cardRest`
 * timing, and a flight-layer card flipping mid-arc shouldn't borrow
 * `cardActivate` timing. Reduced motion collapses the rotation to an instant
 * swap, satisfying the `prefers-reduced-motion` requirement.
 */
export function flipTransition(reducedMotion: boolean): Transition {
  return reducedMotion ? { duration: 0 } : cardFlip;
}
