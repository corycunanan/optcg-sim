import { describe, expect, it } from "vitest";
import {
  cardActivate,
  cardHover,
  cardRest,
  cardTap,
  handCardHover,
} from "@/lib/motion";
import { faceDownRotateY, stateToMotionConfig } from "./state-presets";
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

  it("reducedMotion strips whileHover/whileTap across every active state", () => {
    for (const s of ["rest", "active", "selected"] as const) {
      const cfg = stateToMotionConfig(s, "field", true);
      expect(cfg.whileHover).toBeUndefined();
      expect(cfg.whileTap).toBeUndefined();
    }
  });

  it("is exhaustive over CardState (no accidental undefined)", () => {
    const variants: CardVariant[] = ["field", "hand", "modal", "life", "trash"];
    for (const s of ALL_STATES) {
      for (const v of variants) {
        const cfg = stateToMotionConfig(s, v, false);
        expect(cfg.animate).toBeDefined();
        expect(cfg.transition).toBeDefined();
      }
    }
  });
});

describe("faceDownRotateY", () => {
  it("returns 180 when face down, 0 otherwise", () => {
    expect(faceDownRotateY(true)).toBe(180);
    expect(faceDownRotateY(false)).toBe(0);
    expect(faceDownRotateY(undefined)).toBe(0);
  });
});
