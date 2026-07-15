import { describe, expect, it } from "vitest";
import { getDragOverlayScale } from "./use-board-drag-state";

describe("getDragOverlayScale", () => {
  it("recreates both escaped board transforms in the body portal", () => {
    expect(getDragOverlayScale(1.5, 0.75)).toBe(1.125);
  });
});
