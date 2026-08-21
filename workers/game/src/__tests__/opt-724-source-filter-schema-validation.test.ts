import { describe, expect, it } from "vitest";
import type {
  EffectSchema,
  KeywordTriggerType,
} from "../engine/effect-types.js";
import { validateEffectSchema } from "../engine/schema-registry.js";

function schemaWithSourceFilter(keyword: KeywordTriggerType): EffectSchema {
  return {
    card_id: "TEST-724",
    card_name: "Source-filtered trigger",
    card_type: "Character",
    effects: [
      {
        id: "source-filtered-trigger",
        category: "auto",
        trigger: {
          keyword,
          source_filter: { card_type: "CHARACTER" },
        },
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  };
}

describe("OPT-724 source_filter trigger placement validation", () => {
  it("rejects source_filter outside attack-observation keywords", () => {
    expect(
      validateEffectSchema(schemaWithSourceFilter("ON_PLAY"), "TEST-724"),
    ).toContainEqual(
      expect.stringContaining(
        "source_filter is only supported for WHEN_ATTACKING and WHEN_ATTACKED",
      ),
    );

    expect(
      validateEffectSchema(
        schemaWithSourceFilter("WHEN_ATTACKING"),
        "TEST-724",
      ),
    ).toEqual([]);
  });
});
