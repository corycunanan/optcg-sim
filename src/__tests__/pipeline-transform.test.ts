import { describe, expect, it } from "vitest";

import type { RawVegapullCard } from "../../pipeline/load";
import { transformCards } from "../../pipeline/transform";

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

describe("pipeline transform effect text sanitization", () => {
  it("preserves encoded and fullwidth attribute tokens before stripping HTML", () => {
    const [card] = transformCards(
      [
        rawCard({
          effect:
            "[DON!! x1] This Character cannot be K.O.'d in battle by &lt;Slash&gt; attribute cards.<br><i>Then</i> ＜Special＞ attribute.",
        }),
      ],
      {}
    );

    expect(card.effectText).toBe(
      "[DON!! x1] This Character cannot be K.O.'d in battle by Slash attribute cards.\nThen Special attribute."
    );
  });

  it("unwraps all supported attribute names and collapses sanitizer whitespace", () => {
    const [card] = transformCards(
      [
        rawCard({
          effect:
            "Attributes: &lt;Slash&gt; &lt;Strike&gt; &lt;Ranged&gt; ＜Special＞ ＜Wisdom＞. If ready,  <span>place</span> a card.",
        }),
      ],
      {}
    );

    expect(card.effectText).toBe(
      "Attributes: Slash Strike Ranged Special Wisdom. If ready, place a card."
    );
  });
});
