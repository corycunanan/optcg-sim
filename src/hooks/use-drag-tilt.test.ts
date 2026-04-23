import { describe, expect, it } from "vitest";
import {
  DRAG_TILT_MAX_DEG,
  DRAG_TILT_VELOCITY_SCALE,
  velocityToTilt,
} from "./use-drag-tilt";

/**
 * Pure velocity → tilt math. The React hook that consumes it is covered by
 * visual QA in-app (drag a hand card, drag a DON) — the math here is what we
 * can test without a DOM.
 */
describe("velocityToTilt", () => {
  it("maps positive vx (dragging right) to negative rotateY (right edge toward viewer)", () => {
    const { rotateY } = velocityToTilt(100, 0);
    expect(rotateY).toBeLessThan(0);
  });

  it("maps positive vy (dragging down) to positive rotateX (bottom toward viewer)", () => {
    const { rotateX } = velocityToTilt(0, 100);
    expect(rotateX).toBeGreaterThan(0);
  });

  it("maps negative vy (dragging up) to negative rotateX (top toward viewer)", () => {
    const { rotateX } = velocityToTilt(0, -100);
    expect(rotateX).toBeLessThan(0);
  });

  it("clamps a fast right flick to the negative axis ceiling", () => {
    const { rotateY } = velocityToTilt(10_000, 0);
    expect(rotateY).toBe(-DRAG_TILT_MAX_DEG);
  });

  it("clamps a fast downward flick to the positive axis ceiling", () => {
    const { rotateX } = velocityToTilt(0, 10_000);
    expect(rotateX).toBe(DRAG_TILT_MAX_DEG);
  });

  it("returns zero tilt for zero velocity (idle drag overlay at rest)", () => {
    const { rotateX, rotateY } = velocityToTilt(0, 0);
    // `-vx * scale` produces `-0` at vx=0 — CSS-equivalent to `0`, but
    // `toEqual` distinguishes via `Object.is`. Compare magnitudes.
    expect(Math.abs(rotateX)).toBe(0);
    expect(Math.abs(rotateY)).toBe(0);
  });

  it("composes both axes on a diagonal flick (rotateX + rotateY non-zero)", () => {
    const { rotateX, rotateY } = velocityToTilt(100, 100);
    expect(rotateX).toBeGreaterThan(0);
    expect(rotateY).toBeLessThan(0);
    // Within ceiling — a 100 px/s flick at the default scale sits under saturation.
    expect(Math.abs(rotateX)).toBeLessThan(DRAG_TILT_MAX_DEG);
    expect(Math.abs(rotateY)).toBeLessThan(DRAG_TILT_MAX_DEG);
  });

  it("scales linearly with velocity below the clamp", () => {
    const { rotateY: a } = velocityToTilt(50, 0);
    const { rotateY: b } = velocityToTilt(100, 0);
    expect(b).toBeCloseTo(a * 2, 5);
  });

  it("honors a custom max/scale pair (symmetric clamp)", () => {
    expect(velocityToTilt(10_000, -10_000, 5, 0.01)).toEqual({
      rotateX: -5,
      rotateY: -5,
    });
  });

  it("DRAG_TILT_VELOCITY_SCALE is a positive multiplier (sanity)", () => {
    expect(DRAG_TILT_VELOCITY_SCALE).toBeGreaterThan(0);
  });
});
