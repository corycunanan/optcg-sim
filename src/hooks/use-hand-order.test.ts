import { describe, expect, it } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { computeReorderedCustomOrder, mergeHandOrder } from "./use-hand-order";

function makeCard(instanceId: string, cardId = "OP01-001"): CardInstance {
  return {
    instanceId,
    cardId,
    owner: 0,
    zone: "hand",
    attachedDon: [],
    rested: false,
  } as unknown as CardInstance;
}

describe("mergeHandOrder", () => {
  it("returns the server hand when customOrder is empty", () => {
    const hand = [makeCard("A"), makeCard("B"), makeCard("C")];
    const result = mergeHandOrder([], hand).map((c) => c.instanceId);
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("preserves the player's preferred order for cards that survive", () => {
    const hand = [makeCard("A"), makeCard("B"), makeCard("C")];
    const result = mergeHandOrder(["C", "A", "B"], hand).map((c) => c.instanceId);
    expect(result).toEqual(["C", "A", "B"]);
  });

  it("appends server cards that are not in customOrder (draws)", () => {
    const hand = [makeCard("A"), makeCard("B"), makeCard("C"), makeCard("D")];
    const result = mergeHandOrder(["B", "A", "C"], hand).map((c) => c.instanceId);
    expect(result).toEqual(["B", "A", "C", "D"]);
  });

  it("drops customOrder entries for cards the server no longer has (plays)", () => {
    const hand = [makeCard("A"), makeCard("C")];
    const result = mergeHandOrder(["C", "A", "B"], hand).map((c) => c.instanceId);
    expect(result).toEqual(["C", "A"]);
  });

  it("is idempotent when customOrder already matches hand", () => {
    const hand = [makeCard("A"), makeCard("B")];
    const result = mergeHandOrder(["A", "B"], hand).map((c) => c.instanceId);
    expect(result).toEqual(["A", "B"]);
  });

  it("deduplicates repeated ids in customOrder", () => {
    const hand = [makeCard("A"), makeCard("B")];
    const result = mergeHandOrder(["A", "A", "B"], hand).map((c) => c.instanceId);
    expect(result).toEqual(["A", "B"]);
  });
});

describe("computeReorderedCustomOrder", () => {
  const hand = [makeCard("A"), makeCard("B"), makeCard("C")];

  it("swaps neighbors (A over B)", () => {
    expect(computeReorderedCustomOrder([], hand, "A", "B")).toEqual(["B", "A", "C"]);
  });

  it("moves across multiple positions (A over C)", () => {
    expect(computeReorderedCustomOrder([], hand, "A", "C")).toEqual(["B", "C", "A"]);
  });

  it("returns null when active === over (no-op drop on self)", () => {
    expect(computeReorderedCustomOrder([], hand, "A", "A")).toBeNull();
  });

  it("returns null when an id is not in the effective order", () => {
    expect(computeReorderedCustomOrder([], hand, "A", "Z")).toBeNull();
  });

  it("prunes stale ids from prev before reordering (played card still lingered)", () => {
    // prev contains "B" which the server already removed from hand.
    const currentHand = [makeCard("A"), makeCard("C")];
    const result = computeReorderedCustomOrder(["B", "A", "C"], currentHand, "A", "C");
    expect(result).toEqual(["C", "A"]);
  });

  it("appends new server ids before reordering (drew D during the pending reorder)", () => {
    const currentHand = [makeCard("A"), makeCard("B"), makeCard("C"), makeCard("D")];
    const result = computeReorderedCustomOrder(["A", "B", "C"], currentHand, "D", "A");
    expect(result).toEqual(["D", "A", "B", "C"]);
  });
});
