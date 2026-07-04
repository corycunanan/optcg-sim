import { describe, expect, it, vi } from "vitest";

import type { RawVegapullCard } from "../../pipeline/load";
import { sanitizeEffectText, transformCards } from "../../pipeline/transform";

describe("sanitizeEffectText", () => {
  it("preserves encoded and fullwidth attribute tokens before stripping HTML", () => {
    expect(
      sanitizeEffectText(
        "[DON!! x1] This Character cannot be K.O.'d in battle by &lt;Slash&gt; attribute cards.<br><i>Then</i> ＜Special＞ attribute."
      )
    ).toBe(
      "[DON!! x1] This Character cannot be K.O.'d in battle by Slash attribute cards.\nThen Special attribute."
    );
  });

  it("unwraps all supported attribute names and collapses sanitizer whitespace", () => {
    expect(
      sanitizeEffectText(
        "Attributes: &lt;Slash&gt; &lt;Strike&gt; &lt;Ranged&gt; ＜Special＞ ＜Wisdom＞. If ready,  <span>place</span> a card."
      )
    ).toBe("Attributes: Slash Strike Ranged Special Wisdom. If ready, place a card.");
  });

  it("returns empty string for blank or placeholder text", () => {
    expect(sanitizeEffectText("")).toBe("");
    expect(sanitizeEffectText("-")).toBe("");
  });

  it("warns when an unrecognized capitalized token is about to be stripped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(sanitizeEffectText("has the &lt;Haki&gt; attribute", "OP99-001")).toBe(
        "has the attribute"
      );
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain("<Haki>");
      expect(warn.mock.calls[0][0]).toContain("OP99-001");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn on ordinary lowercase HTML tags", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sanitizeEffectText("<i>Once Per Turn</i><br>Draw 1 card.");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("transformCards effect/trigger sanitization wiring", () => {
  function rawCard(overrides: Partial<RawVegapullCard> = {}): RawVegapullCard {
    return {
      id: "OP99-001",
      pack_id: "test-pack",
      name: "Test Card",
      rarity: "C",
      category: "Character",
      img_url: "",
      img_full_url: "",
      cost: 1,
      attributes: ["Slash"],
      power: 1000,
      counter: null,
      colors: ["Red"],
      block_number: null,
      types: [],
      effect: "",
      trigger: null,
      ...overrides,
    };
  }

  it("sanitizes both effect and trigger text", () => {
    const [card] = transformCards(
      [
        rawCard({
          effect: "Cannot be K.O.'d by &lt;Slash&gt; attribute cards.",
          trigger: "[Trigger] K.O. up to 1 ＜Strike＞ attribute Character.<br>Then draw 1 card.",
        }),
      ],
      {}
    );

    expect(card.effectText).toBe("Cannot be K.O.'d by Slash attribute cards.");
    expect(card.triggerText).toBe(
      "[Trigger] K.O. up to 1 Strike attribute Character.\nThen draw 1 card."
    );
  });

  it("normalizes placeholder trigger text to null", () => {
    const [card] = transformCards([rawCard({ trigger: "-" })], {});
    expect(card.triggerText).toBeNull();
  });
});
