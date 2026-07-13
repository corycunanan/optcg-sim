import { describe, expect, it } from "vitest";
import { getNextRovingId } from "./use-roving-focus";

describe("getNextRovingId", () => {
  const ids = ["a", "b", "c"];

  it("wraps forward and backward through a card collection", () => {
    expect(getNextRovingId(ids, "c", "ArrowRight")).toBe("a");
    expect(getNextRovingId(ids, "a", "ArrowLeft")).toBe("c");
    expect(getNextRovingId(ids, "b", "ArrowDown")).toBe("c");
    expect(getNextRovingId(ids, "b", "ArrowUp")).toBe("a");
  });

  it("supports Home and End without changing unrelated keys", () => {
    expect(getNextRovingId(ids, "b", "Home")).toBe("a");
    expect(getNextRovingId(ids, "b", "End")).toBe("c");
    expect(getNextRovingId(ids, "b", "Enter")).toBe("b");
  });

  it("handles an empty collection", () => {
    expect(getNextRovingId([], null, "ArrowRight")).toBeNull();
  });
});
