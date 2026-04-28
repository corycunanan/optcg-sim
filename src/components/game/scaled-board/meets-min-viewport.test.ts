import { describe, expect, it } from "vitest";
import {
  meetsMinViewport,
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
} from "./meets-min-viewport";

describe("meetsMinViewport", () => {
  it("returns true at exactly the 1280x720 floor (inclusive)", () => {
    expect(meetsMinViewport(MIN_VIEWPORT_WIDTH, MIN_VIEWPORT_HEIGHT)).toBe(true);
  });

  it("returns false one pixel below the width floor", () => {
    expect(
      meetsMinViewport(MIN_VIEWPORT_WIDTH - 1, MIN_VIEWPORT_HEIGHT),
    ).toBe(false);
  });

  it("returns false one pixel below the height floor", () => {
    expect(
      meetsMinViewport(MIN_VIEWPORT_WIDTH, MIN_VIEWPORT_HEIGHT - 1),
    ).toBe(false);
  });

  it("returns true above the floor on both axes", () => {
    expect(meetsMinViewport(1920, 1080)).toBe(true);
    expect(meetsMinViewport(2560, 1440)).toBe(true);
  });

  it("returns false at zero size", () => {
    expect(meetsMinViewport(0, 0)).toBe(false);
  });

  it("returns false when only one axis meets the floor", () => {
    expect(meetsMinViewport(1920, 600)).toBe(false);
    expect(meetsMinViewport(800, 1080)).toBe(false);
  });
});
