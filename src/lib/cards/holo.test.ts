import { describe, expect, it } from "vitest";

import { HOLO_EFFECT_BY_RARITY, holoEffectForRarity } from "./holo";

describe("holoEffectForRarity", () => {
  it.each(Object.entries(HOLO_EFFECT_BY_RARITY))(
    "maps %s artwork to %s",
    (rarity, effect) => {
      expect(holoEffectForRarity(rarity)).toBe(effect);
    }
  );

  it.each([undefined, null, "", "Unknown", "SEC", "__proto__"])(
    "leaves unsupported rarity %s untreated",
    (rarity) => {
      expect(holoEffectForRarity(rarity)).toBe("none");
    }
  );
});
