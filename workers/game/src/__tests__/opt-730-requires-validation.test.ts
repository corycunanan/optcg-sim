import { describe, expect, it } from "vitest";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import { validateEffectSchema } from "../engine/schema-registry.js";

function schemaWithAction(action: Action): EffectSchema {
  return {
    card_id: "TEST-730",
    card_name: "Requires Validation",
    card_type: "Event",
    effects: [
      {
        id: "requires-validation",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [action],
      },
    ],
  } as EffectSchema;
}

describe("OPT-730 FULL_TARGET_COUNT schema validation", () => {
  it("rejects ref-dependent targets", () => {
    const schema = schemaWithAction({
      type: "TRASH_CARD",
      target: {
        type: "SELECTED_CARDS",
        ref: "picked",
        count: { exact: 3 },
      },
      requires: { type: "FULL_TARGET_COUNT" },
    });

    expect(validateEffectSchema(schema, "TEST-730")).toContainEqual(
      expect.stringContaining(
        "FULL_TARGET_COUNT does not support ref-dependent target type 'SELECTED_CARDS'"
      )
    );
  });

  it("accepts an exact CARD_IN_HAND target", () => {
    const schema = schemaWithAction({
      type: "TRASH_CARD",
      target: {
        type: "CARD_IN_HAND",
        controller: "OPPONENT",
        count: { exact: 3 },
      },
      requires: { type: "FULL_TARGET_COUNT" },
    });

    expect(validateEffectSchema(schema, "TEST-730")).toEqual([]);
  });
});
