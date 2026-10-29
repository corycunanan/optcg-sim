import { describe, expect, it } from "vitest";
import { isCardNegated } from "../engine/modifiers.js";
import { CARDS } from "./helpers.js";
import { rig } from "./opt-960-rig.js";

/** Synthetic future-schema case; OP13-064 itself is unconditional. */
describe("OPT-1008 conditional permanent negation query", () => {
  it("bounds the effective-keyword condition path without overflowing the stack", () => {
    const r = rig();
    r.put("OP13-064", 0, "CHARACTER", {
      data: { types: ["Roger Pirates"] },
    });
    const ally = r.put("SYN-rush-ally", 0, "CHARACTER", {
      data: { ...CARDS.RUSH, id: "SYN-rush-ally", types: [] },
    });
    const aura = r.state.activeEffects.find(
      (effect) => effect.sourceEffectBlockId === "OP13-064_negate_effects",
    )!;
    aura.conditions = {
      type: "CARD_ON_FIELD",
      controller: "SELF",
      filter: { card_type: "CHARACTER", keywords: ["RUSH"] },
    };
    // No Boolean expectation is asserted: the synthetic condition is N = !N.
    // This red regression records the missing bounded-query policy, not a
    // proposed gameplay answer or permission to replace RangeError with Error.
    expect(() => isCardNegated(ally, r.state, r.db)).not.toThrow();
  });
});
