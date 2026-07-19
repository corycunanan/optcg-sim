import { describe, expect, it } from "vitest";
import { mergeDonCountAdjustments } from "./don-count-adjustments";

describe("mergeDonCountAdjustments", () => {
  it("includes pending redistribution previews for either side of the board", () => {
    const merged = mergeDonCountAdjustments(
      new Map([
        ["player-card", -1],
        ["opponent-card", 1],
      ]),
      null
    );

    expect(merged).toEqual(
      new Map([
        ["player-card", -1],
        ["opponent-card", 1],
      ])
    );
  });

  it("combines redistribution and in-flight animation adjustments", () => {
    const merged = mergeDonCountAdjustments(
      new Map([["opponent-card", 2]]),
      new Map([["opponent-card", -1]])
    );

    expect(merged?.get("opponent-card")).toBe(1);
  });
});
