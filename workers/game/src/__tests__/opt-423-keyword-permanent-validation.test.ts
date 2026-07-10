import { describe, expect, it } from "vitest";
import {
  getAllAuthoredSchemas,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";

function schemaWith(block: EffectBlock): EffectSchema {
  return {
    card_id: "TEST-001",
    card_name: "Validator Test Card",
    card_type: "Character",
    effects: [block],
  };
}

describe("OPT-423 keyword-only permanent block validation", () => {
  it("accepts a permanent block with intrinsic keywords", () => {
    const errors = validateEffectSchema(
      schemaWith({
        id: "intrinsic_blocker",
        category: "permanent",
        flags: { keywords: ["BLOCKER"] },
      }),
      "TEST-001",
    );

    expect(errors).toEqual([]);
  });

  it("rejects a permanent block with an empty keyword list", () => {
    const errors = validateEffectSchema(
      schemaWith({
        id: "empty_keywords",
        category: "permanent",
        flags: { keywords: [] },
      }),
      "TEST-001",
    );

    expect(errors).toContain(
      "[TEST-001] effects[0]: 'permanent' block needs 'modifiers', 'prohibitions', or non-empty 'flags.keywords'",
    );
  });

  it("rejects a permanent block with metadata but no permanent behavior", () => {
    const errors = validateEffectSchema(
      schemaWith({
        id: "metadata_only",
        category: "permanent",
        flags: { optional: true },
      }),
      "TEST-001",
    );

    expect(errors).toContain(
      "[TEST-001] effects[0]: 'permanent' block needs 'modifiers', 'prohibitions', or non-empty 'flags.keywords'",
    );
  });

  it("accepts every authored keyword-only permanent block", () => {
    const failures: string[] = [];

    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      const permanentErrors = validateEffectSchema(schema, cardId).filter((error) =>
        error.includes("'permanent' block needs"),
      );
      failures.push(...permanentErrors);
    }

    expect(failures).toEqual([]);
  });
});
