import { describe, expect, it } from "vitest";
import {
  pileArrivalDelta,
  pileRemovalDelta,
  reconcilePendingPileArrival,
} from "./use-pile-receipt";

describe("pileArrivalDelta", () => {
  it("seeds without replaying receipts on rehydrate", () => {
    expect(pileArrivalDelta(null, 12)).toBe(0);
  });

  it("reports only positive visible pile growth", () => {
    expect(pileArrivalDelta(4, 7)).toBe(3);
    expect(pileArrivalDelta(7, 7)).toBe(0);
    expect(pileArrivalDelta(7, 5)).toBe(0);
  });
});

describe("reconcilePendingPileArrival", () => {
  it("cancels a provisional receipt when an in-flight reservation catches up", () => {
    expect(reconcilePendingPileArrival(1, 1, 0)).toBe(0);
  });

  it("keeps the net batch when only part of a provisional arrival is reserved", () => {
    expect(reconcilePendingPileArrival(3, 3, 1)).toBe(1);
  });
});

describe("pileRemovalDelta (OPT-1059)", () => {
  it("seeds silently", () => {
    expect(pileRemovalDelta(null, 3, 0)).toBe(0);
  });

  it("reports cards that left the pile", () => {
    expect(pileRemovalDelta(5, 4, 0)).toBe(1);
    expect(pileRemovalDelta(5, 5, 0)).toBe(0);
    expect(pileRemovalDelta(4, 5, 0)).toBe(0);
  });

  it("is not fooled by a reservation hiding an arrival already shown", () => {
    expect(pileRemovalDelta(5, 4, 1)).toBe(0);
    expect(pileRemovalDelta(5, 3, 1)).toBe(1);
  });
});
