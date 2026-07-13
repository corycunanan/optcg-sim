import { describe, expect, it } from "vitest";
import {
  pileArrivalDelta,
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
