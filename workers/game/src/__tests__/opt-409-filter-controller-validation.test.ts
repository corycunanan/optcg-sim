/**
 * OPT-409 — `controller` inside a Target.filter is a silent no-op on normal
 * targeting paths: matchesFilter only enforces it when the caller passes the
 * optional filterController argument, which the target-resolver never does.
 * validateEffectSchema now rejects the pattern so a schema can't ship an
 * unchecked filter without warning.
 */

import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { validateEffectSchema, getAllAuthoredSchemas } from "../engine/schema-registry.js";

function schemaWithTarget(target: Record<string, unknown>): EffectSchema {
  return {
    card_id: "TEST-409",
    card_name: "Test",
    card_type: "Character",
    effects: [
      {
        id: "opt409-block",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [{ type: "KO", target } as never],
      },
    ],
  } as EffectSchema;
}

describe("OPT-409: controller inside Target.filter is rejected", () => {
  it("flags controller in a target filter", () => {
    const errors = validateEffectSchema(
      schemaWithTarget({
        type: "CHARACTER",
        count: { exact: 1 },
        filter: { controller: "OPPONENT", cost_max: 3 },
      }),
      "TEST-409",
    );
    expect(errors.some((e) => e.includes("'controller' inside target.filter"))).toBe(true);
  });

  it("flags controller nested in a filter any_of branch", () => {
    const errors = validateEffectSchema(
      schemaWithTarget({
        type: "CHARACTER",
        count: { exact: 1 },
        filter: { any_of: [{ controller: "SELF" }, { cost_max: 2 }] },
      }),
      "TEST-409",
    );
    expect(errors.some((e) => e.includes("'controller' inside target.filter"))).toBe(true);
  });

  it("accepts controller on the Target itself", () => {
    const errors = validateEffectSchema(
      schemaWithTarget({
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { exact: 1 },
        filter: { cost_max: 3 },
      }),
      "TEST-409",
    );
    expect(errors).toHaveLength(0);
  });

  it("no authored schema puts controller inside a target filter", () => {
    for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
      const errors = validateEffectSchema(schema, cardId)
        .filter((e) => e.includes("'controller' inside target.filter"));
      expect(errors, `${cardId}: ${errors.join("; ")}`).toHaveLength(0);
    }
  });
});
