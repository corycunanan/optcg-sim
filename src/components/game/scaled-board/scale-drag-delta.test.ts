import { describe, expect, it } from "vitest";
import { scaleDragDelta } from "./scale-drag-delta";

describe("scaleDragDelta", () => {
  it("passes deltas through unchanged at scale 1.0", () => {
    expect(scaleDragDelta({ x: 100, y: 50 }, 1.0)).toEqual({ x: 100, y: 50 });
  });

  it("doubles deltas at scale 0.5 (board fills half the viewport — pointer covers more design pixels)", () => {
    expect(scaleDragDelta({ x: 100, y: 50 }, 0.5)).toEqual({ x: 200, y: 100 });
  });

  it("halves deltas at scale 2.0 (board upscaled — pointer covers fewer design pixels)", () => {
    expect(scaleDragDelta({ x: 100, y: 50 }, 2.0)).toEqual({ x: 50, y: 25 });
  });

  it("preserves zero deltas at any scale", () => {
    expect(scaleDragDelta({ x: 0, y: 0 }, 0.85)).toEqual({ x: 0, y: 0 });
  });

  it("preserves sign — negative deltas inherit scale correction", () => {
    expect(scaleDragDelta({ x: -100, y: -50 }, 0.5)).toEqual({ x: -200, y: -100 });
  });

  it("matches the scope-doc worked example: 100 viewport px at scale 0.85 → ~117.6 design px", () => {
    const { x } = scaleDragDelta({ x: 100, y: 0 }, 0.85);
    expect(x).toBeCloseTo(117.647, 3);
  });
});
