import { describe, expect, it } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { isRedrawnHand } from "./use-mulligan-redraw";

const card = (instanceId: string) =>
  ({ instanceId, cardId: "OP01-001" }) as CardInstance;

describe("isRedrawnHand", () => {
  const oldHand = [card("a"), card("b")];

  it("accepts a hand that shares no instance id with the old one", () => {
    expect(isRedrawnHand(oldHand, [card("c"), card("d")])).toBe(true);
  });

  it("rejects the old hand, a partly old hand and an empty hand", () => {
    expect(isRedrawnHand(oldHand, oldHand)).toBe(false);
    expect(isRedrawnHand(oldHand, [card("c"), card("a")])).toBe(false);
    expect(isRedrawnHand(oldHand, [])).toBe(false);
  });
});
