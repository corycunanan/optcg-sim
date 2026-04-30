import { describe, expect, it } from "vitest";
import { computeBoardScaling } from "./board-geometry";

describe("computeBoardScaling", () => {
  it("scales the intrinsic board up to fit the 1920x1080 design canvas", () => {
    const { boardScale } = computeBoardScaling({ width: 1920, height: 1080 });

    expect(boardScale).toBeGreaterThan(1);
    expect(boardScale).toBeCloseTo(1.269, 3);
  });

  it("uses the same design-canvas composition at larger 16:9 viewports", () => {
    const { boardScale } = computeBoardScaling({ width: 2560, height: 1440 });

    expect(boardScale).toBeCloseTo(1.726, 3);
  });

  it("still scales down when the available viewport is smaller than the board content", () => {
    const { boardScale } = computeBoardScaling({ width: 640, height: 480 });

    expect(boardScale).toBeLessThan(1);
    expect(boardScale).toBeCloseTo(0.508, 3);
  });
});
