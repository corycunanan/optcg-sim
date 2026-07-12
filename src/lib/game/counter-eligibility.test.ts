import { describe, expect, it } from "vitest";
import type { CardData } from "@shared/game-types";
import { isCounterEligibleCard, isCounterEvent } from "./counter-eligibility";

function card(
  type: CardData["type"],
  counter: number | null,
  effectText = "",
): CardData {
  return {
    id: `${type}-${counter}`,
    name: type,
    type,
    color: [],
    cost: null,
    power: null,
    counter,
    life: null,
    attribute: [],
    types: [],
    effectText,
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: null,
    imageUrl: null,
  };
}

describe("isCounterEligibleCard", () => {
  it.each([null, 0, 1000, 2000])(
    "keeps a Character with printed counter %s attemptable for rule mods",
    (counter) => {
      expect(isCounterEligibleCard(card("Character", counter))).toBe(true);
    },
  );

  it("accepts only Events with a printed [Counter] effect", () => {
    const counterEvent = card("Event", null, "[Counter] Draw 1 card.");
    const mainEvent = card("Event", null, "[Main] Draw 1 card.");
    expect(isCounterEvent(counterEvent)).toBe(true);
    expect(isCounterEligibleCard(counterEvent)).toBe(true);
    expect(isCounterEvent(mainEvent)).toBe(false);
    expect(isCounterEligibleCard(mainEvent)).toBe(false);
  });

  it("rejects non-counter card types and missing card data", () => {
    expect(isCounterEligibleCard(card("Leader", null))).toBe(false);
    expect(isCounterEligibleCard(card("Stage", null))).toBe(false);
    expect(isCounterEligibleCard(undefined)).toBe(false);
  });
});
