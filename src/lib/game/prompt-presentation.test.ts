import { describe, expect, it } from "vitest";
import {
  promptDialogTitle,
  promptEffectType,
  promptSourceCardName,
} from "./prompt-presentation";

describe("promptEffectType", () => {
  it("reads the leading timing token", () => {
    expect(promptEffectType("[On Play] Draw 1 card.")).toBe("On Play");
    expect(promptEffectType("[Activate: Main] Rest this card.")).toBe(
      "Activate: Main"
    );
  });

  it("treats [Trigger] and [Counter] as effect types", () => {
    expect(promptEffectType("[Trigger] Play this card.")).toBe("Trigger");
    expect(promptEffectType("[Counter] Give +2000 power.")).toBe("Counter");
  });

  it("skips DON!! and frequency prefixes before the timing", () => {
    expect(
      promptEffectType("[DON!! x1] [When Attacking] K.O. up to 1 Character.")
    ).toBe("When Attacking");
    expect(
      promptEffectType("[Once Per Turn] [Activate: Main] Draw 1 card.")
    ).toBe("Activate: Main");
  });

  it("returns null when the description opens with prose", () => {
    expect(promptEffectType("Choose a cost to pay")).toBeNull();
    expect(promptEffectType("")).toBeNull();
  });
});

describe("promptDialogTitle", () => {
  it("prefixes the effect type with Card Effect", () => {
    expect(promptDialogTitle("[On Play] Draw 1 card.")).toBe(
      "Card Effect: On Play"
    );
  });

  it("falls back to Card Effect without a timing", () => {
    expect(promptDialogTitle("Select how to pay the cost")).toBe("Card Effect");
  });
});

describe("promptSourceCardName", () => {
  const cardDb = { "OP01-001": { name: "Roronoa Zoro" } } as never;

  it("resolves the printed name from the card database", () => {
    expect(promptSourceCardName(cardDb, { cardId: "OP01-001" })).toBe(
      "Roronoa Zoro"
    );
  });

  it("falls back to the card id and null without a source", () => {
    expect(promptSourceCardName(cardDb, { cardId: "OP99-999" })).toBe(
      "OP99-999"
    );
    expect(promptSourceCardName(cardDb, undefined)).toBeNull();
  });
});
