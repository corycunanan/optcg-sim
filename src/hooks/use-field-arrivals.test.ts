import { describe, expect, it } from "vitest";
import { computeFieldArrivals } from "./use-field-arrivals";

describe("computeFieldArrivals", () => {
  it("returns an empty set on the seeding render (prev === null)", () => {
    const arrivals = computeFieldArrivals(null, new Set(["a", "b"]));
    expect(arrivals.size).toBe(0);
  });

  it("returns ids present in current but not in prev", () => {
    const arrivals = computeFieldArrivals(new Set(["a"]), new Set(["a", "b", "c"]));
    expect(arrivals).toEqual(new Set(["b", "c"]));
  });

  it("returns empty when nothing changed", () => {
    const arrivals = computeFieldArrivals(new Set(["a", "b"]), new Set(["a", "b"]));
    expect(arrivals.size).toBe(0);
  });

  it("ignores removals — only new-to-current ids count as arrivals", () => {
    const arrivals = computeFieldArrivals(new Set(["a", "b"]), new Set(["a"]));
    expect(arrivals.size).toBe(0);
  });
});
