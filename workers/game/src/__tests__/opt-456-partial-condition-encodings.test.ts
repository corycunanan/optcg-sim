import { describe, expect, it } from "vitest";
import type { EffectBlock } from "../engine/effect-types.js";
import { EB04_015_JINBE } from "../engine/schemas/eb04.js";
import { OP08_077_CONQUEST_OF_THE_SEA } from "../engine/schemas/op08.js";
import { OP11_034_HATCHAN } from "../engine/schemas/op11.js";
import { OP16_084_KOUZUKI_MOMONOSUKE } from "../engine/schemas/op16.js";

function block(schema: { effects: EffectBlock[] }, id: string): EffectBlock {
  return schema.effects.find((effect) => effect.id === id)!;
}

function leaderTraits(effect: EffectBlock): string[] {
  const condition = effect.post_cost_conditions;
  if (!condition || !("any_of" in condition)) return [];
  return condition.any_of.flatMap((entry) =>
    "property" in entry && entry.property && "trait" in entry.property
      ? [entry.property.trait as string]
      : [],
  );
}

describe("OPT-456: partial post-colon conditions", () => {
  it.each([
    [EB04_015_JINBE, "on_ko_play"],
    [OP11_034_HATCHAN, "activate_prohibition"],
  ] as const)("encodes both Fish-Man and Merfolk after the cost", (schema, id) => {
    const effect = block(schema, id);
    expect(effect.conditions).toBeUndefined();
    expect(leaderTraits(effect)).toEqual(["Fish-Man", "Merfolk"]);
  });

  it("keeps both OP08-077 leader traits in the post-cost gate", () => {
    const effect = block(OP08_077_CONQUEST_OF_THE_SEA, "main_effect");
    expect(effect.conditions).toBeUndefined();
    expect(leaderTraits(effect)).toEqual([
      "Animal Kingdom Pirates",
      "Big Mom Pirates",
    ]);
  });

  it("splits OP16-084's pre-cost self qualifier from its post-cost DON gate", () => {
    const effect = block(
      OP16_084_KOUZUKI_MOMONOSUKE,
      "activate_trash_self_play_momonosuke",
    );
    expect(effect.conditions).toEqual({
      type: "SELF_COST",
      operator: ">=",
      value: 20,
    });
    expect(effect.post_cost_conditions).toEqual({
      type: "DON_FIELD_COUNT",
      controller: "SELF",
      operator: ">=",
      value: 9,
    });
  });
});
