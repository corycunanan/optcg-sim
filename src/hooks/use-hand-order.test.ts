import { describe, expect, it } from "vitest";
import type { CardInstance } from "@shared/game-types";
import {
  computeReorderedCustomOrder,
  mergeHandOrder,
  mergeHiddenHandOrder,
  orderHandFromReceivedState,
} from "./use-hand-order";

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

describe("mergeHiddenHandOrder", () => {
  it("inserts a newly observed hidden card at a visual random position", () => {
    const hand = [makeCard("A"), makeCard("B"), makeCard("C"), makeCard("D")];
    const random = () => 0.34;
    const result = mergeHiddenHandOrder(["A", "B", "C"], hand, random)
      .map((card) => card.instanceId);

    expect(result).toEqual(["A", "D", "B", "C"]);
  });

  it("preserves surviving hidden cards and drops removed placeholders", () => {
    const hand = [makeCard("A"), makeCard("C")];
    const result = mergeHiddenHandOrder(["C", "B", "A"], hand)
      .map((card) => card.instanceId);

    expect(result).toEqual(["C", "A"]);
  });
});

describe("orderHandFromReceivedState", () => {
  it("preserves received order when cards carry real identities", () => {
    const hand = [makeCard("A"), makeCard("B"), makeCard("C")];

    expect(
      orderHandFromReceivedState(["C", "A", "B"], hand).map(
        (card) => card.instanceId,
      ),
    ).toEqual(["C", "A", "B"]);
  });

  it("uses privacy-safe visual ordering only when received cards are hidden", () => {
    const hand = [
      makeCard("A", "hidden"),
      makeCard("B", "hidden"),
      makeCard("C", "hidden"),
    ];

    expect(
      orderHandFromReceivedState(["C", "B", "A"], hand).map(
        (card) => card.instanceId,
      ),
    ).not.toEqual(["C", "B", "A"]);
  });

  it("keeps a mixed defensive hand in authoritative order", () => {
    const hand = [
      makeCard("A", "OP01-001"),
      makeCard("B", "hidden"),
      makeCard("C", "OP01-003"),
    ];

    expect(
      orderHandFromReceivedState([], hand).map((card) => card.instanceId),
    ).toEqual(["A", "B", "C"]);
  });
});
