import { describe, expect, it } from "vitest";
import {
  cardActivate,
  cardBreathing,
  cardFlip,
  cardHover,
  cardRest,
  cardTap,
  cardTapReduced,
  handCardHover,
} from "@/lib/motion";
import {
  faceDownRotateY,
  flipTransition,
  idleBreathingConfig,
  stateToMotionConfig,
} from "./state-presets";
import type { CardState, CardVariant } from "./types";

const ALL_STATES: CardState[] = [
  "rest",
  "active",
  "selected",
  "invalid",
  "dragging",
  "in-flight",
];

describe("stateToMotionConfig", () => {
  it("rest is game-rested: 90° rotate, dimmed, cardRest spring", () => {
    const cfg = stateToMotionConfig("rest", "field", false);
    expect(cfg.animate.rotate).toBe(90);
    expect(cfg.animate.filter).toBe("brightness(0.6)");
    expect(cfg.transition).toEqual(cardRest);
  });

  it("active is upright + cardActivate spring", () => {
    const cfg = stateToMotionConfig("active", "field", false);
    expect(cfg.animate.rotate).toBe(0);
    expect(cfg.animate.filter).toBe("brightness(1)");
    expect(cfg.transition).toEqual(cardActivate);
  });

  it("invalid dims to 0.35 and removes hover/tap", () => {
    const cfg = stateToMotionConfig("invalid", "modal", false);
    expect(cfg.animate.opacity).toBe(0.35);
    expect(cfg.whileHover).toBeUndefined();
    expect(cfg.whileTap).toBeUndefined();
  });

  it("dragging keeps the origin visually intact (no fade) but removes hover/tap", () => {
    const cfg = stateToMotionConfig("dragging", "hand", false);
    expect(cfg.animate.opacity).toBe(1);
    expect(cfg.whileHover).toBeUndefined();
    expect(cfg.whileTap).toBeUndefined();
  });

  it("in-flight is passive: no hover, no tap", () => {
    const cfg = stateToMotionConfig("in-flight", "field", false);
    expect(cfg.whileHover).toBeUndefined();
    expect(cfg.whileTap).toBeUndefined();
  });

  it("field variant hover uses cardHover, hand variant uses handCardHover", () => {
    const field = stateToMotionConfig("active", "field", false);
    const hand = stateToMotionConfig("active", "hand", false);
    expect(field.whileHover).toEqual(cardHover);
    expect(hand.whileHover).toEqual(handCardHover);
  });

  it("field variant exposes cardTap; hand variant suppresses tap (lift-hover only)", () => {
    expect(stateToMotionConfig("active", "field", false).whileTap).toEqual(
      cardTap,
    );
    expect(stateToMotionConfig("active", "hand", false).whileTap).toBeUndefined();
  });

  it("reducedMotion strips hover and falls the tap back to plain scale (no 3D dip)", () => {
    for (const s of ["rest", "active", "selected"] as const) {
      const cfg = stateToMotionConfig(s, "field", true);
      expect(cfg.whileHover).toBeUndefined();
      // Non-hand variants keep a simple-scale tap under reduced-motion (OPT-275).
      expect(cfg.whileTap).toEqual(cardTapReduced);
      expect((cfg.whileTap as Record<string, unknown>).rotateX).toBeUndefined();
    }
    // Hand keeps its lift-hover-only contract — still no tap.
    expect(stateToMotionConfig("active", "hand", true).whileTap).toBeUndefined();
  });

  it("merges motionDelay into the state transition without overwriting the spring", () => {
    const cfg = stateToMotionConfig("active", "field", false, 0.15);
    expect(cfg.transition).toEqual({ ...cardActivate, delay: 0.15 });
    const rest = stateToMotionConfig("rest", "field", false, 0.09);
    expect(rest.transition).toEqual({ ...cardRest, delay: 0.09 });
  });

  it("omits delay when motionDelay is undefined (identity on transition)", () => {
    const cfg = stateToMotionConfig("active", "field", false);
    expect(cfg.transition).toEqual(cardActivate);
    expect((cfg.transition as { delay?: number }).delay).toBeUndefined();
  });

  it("is exhaustive over CardState (no accidental undefined)", () => {
    const variants: CardVariant[] = ["field", "hand", "modal", "life", "trash", "don"];
    for (const s of ALL_STATES) {
      for (const v of variants) {
        const cfg = stateToMotionConfig(s, v, false);
        expect(cfg.animate).toBeDefined();
        expect(cfg.transition).toBeDefined();
      }
    }
  });
});

describe("idleBreathingConfig", () => {
  it("returns the cardBreathing loop for focal active field/hand/modal cards", () => {
    for (const v of ["field", "hand", "modal"] as const) {
      const cfg = idleBreathingConfig("active", v, false, false);
      expect(cfg).toBeDefined();
      const { transition: _, ...animateOnly } = cardBreathing;
      expect(cfg!.animate).toEqual(animateOnly);
      expect(cfg!.transition).toBe(cardBreathing.transition);
    }
  });

  it("returns the loop for selected cards (target picker keeps them alive)", () => {
    expect(idleBreathingConfig("selected", "field", false, false)).toBeDefined();
  });

  it("skips non-focal zones (trash / life / don)", () => {
    for (const v of ["trash", "life", "don"] as const) {
      expect(idleBreathingConfig("active", v, false, false)).toBeUndefined();
    }
  });

  it("skips non-idle states (rest / invalid / dragging / in-flight)", () => {
    for (const s of ["rest", "invalid", "dragging", "in-flight"] as const) {
      expect(idleBreathingConfig(s, "field", false, false)).toBeUndefined();
    }
  });

  it("skips face-down cards — sleeves don't breathe", () => {
    expect(idleBreathingConfig("active", "field", true, false)).toBeUndefined();
  });

  it("honors prefers-reduced-motion", () => {
    expect(idleBreathingConfig("active", "field", false, true)).toBeUndefined();
  });
});

describe("faceDownRotateY", () => {
  it("returns 180 when face down, 0 otherwise", () => {
    expect(faceDownRotateY(true)).toBe(180);
    expect(faceDownRotateY(false)).toBe(0);
    expect(faceDownRotateY(undefined)).toBe(0);
  });
});

describe("flipTransition", () => {
  it("uses the dedicated cardFlip spring when motion is allowed (OPT-276)", () => {
    expect(flipTransition(false)).toBe(cardFlip);
  });

  it("collapses to an instant swap under prefers-reduced-motion (OPT-276)", () => {
    expect(flipTransition(true)).toEqual({ duration: 0 });
  });
});
