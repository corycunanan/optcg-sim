import { describe, expect, it } from "vitest";
import { computeBoardScale } from "./compute-scale";

describe("computeBoardScale", () => {
  it("returns 1 when container matches design resolution", () => {
    expect(computeBoardScale(1920, 1080, 1920, 1080)).toBe(1);
  });

  it("scales down to fit a 1280x720 viewport at 1920x1080 design", () => {
    expect(computeBoardScale(1280, 720, 1920, 1080)).toBeCloseTo(2 / 3);
  });

  it("letterboxes by picking the smaller axis ratio when the container is wider than 16:9", () => {
    expect(computeBoardScale(2560, 1080, 1920, 1080)).toBe(1);
  });

  it("letterboxes by picking the smaller axis ratio when the container is taller than 16:9", () => {
    expect(computeBoardScale(1280, 1080, 1920, 1080)).toBeCloseTo(1280 / 1920);
  });

  it("scales up at 2560x1440 (4/3x of 1920x1080)", () => {
    expect(computeBoardScale(2560, 1440, 1920, 1080)).toBeCloseTo(4 / 3);
  });
});
