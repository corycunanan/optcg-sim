import { describe, expect, it } from "vitest";

import { collectDeckColors } from "./colors";

describe("collectDeckColors", () => {
  it("includes the leader's colors in the deck identity", () => {
    expect(collectDeckColors(["Red"], [["Green"], ["Green"]])).toEqual([
      "Red",
      "Green",
    ]);
  });

  it("still reports a color for a leader-only draft deck", () => {
    // The old API definition excluded the leader, so a freshly created deck
    // rendered zero dots through /api/decks but one on /decks.
    expect(collectDeckColors(["Purple"], [])).toEqual(["Purple"]);
  });

  it("dedupes across the leader and the main deck, leader first", () => {
    expect(
      collectDeckColors(
        ["Blue", "Yellow"],
        [["Yellow"], ["Blue", "Yellow"], ["Blue"]]
      )
    ).toEqual(["Blue", "Yellow"]);
  });

  it("returns an empty list when nothing carries a color", () => {
    expect(collectDeckColors([], [[], []])).toEqual([]);
  });
});
