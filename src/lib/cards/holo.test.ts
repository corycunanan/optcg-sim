import { describe, expect, it } from "vitest";

import { holoEffectForRarity } from "./holo";

describe("holoEffectForRarity", () => {
  it.each([
    ["Common", "regular-holo"],
    ["Uncommon", "regular-holo"],
    ["Rare", "regular-holo"],
    ["SuperRare", "prism-holo"],
    ["Promo", "prism-holo"],
    ["SecretRare", "rainbow-holo"],
    ["Special", "rainbow-holo"],
    ["TreasureRare", "rainbow-holo"],
    ["Leader", "cosmos-holo"],
  ] as const)("maps %s artwork to %s", (rarity, effect) => {
    expect(holoEffectForRarity(rarity)).toBe(effect);
  });

  it.each([undefined, null, "", "Unknown", "SEC", "__proto__"])(
    "leaves unsupported rarity %s untreated",
    (rarity) => {
      expect(holoEffectForRarity(rarity)).toBe("none");
    }
  );
});
