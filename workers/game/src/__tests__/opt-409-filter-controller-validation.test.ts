/**
 * OPT-409 — `controller` inside a Target.filter is a silent no-op on normal
 * targeting paths: matchesFilter only enforces it when the caller passes the
 * optional filterController argument, which the target-resolver never does.
 * validateEffectSchema now rejects the pattern so a schema can't ship an
 * unchecked filter without warning.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  it("flags controller buried two any_of levels deep", () => {
    const errors = validateEffectSchema(
      schemaWithTarget({
        type: "CHARACTER",
        count: { exact: 1 },
        filter: { any_of: [{ any_of: [{ controller: "OPPONENT" }] }] },
      }),
      "TEST-409",
    );
    expect(errors.some((e) => e.includes("'controller' inside target.filter"))).toBe(true);
  });

  it("flags controller inside a permanent modifier's target filter", () => {
    const errors = validateEffectSchema(
      {
        card_id: "TEST-409",
        card_name: "Test",
        card_type: "Character",
        effects: [
          {
            id: "opt409-modifier-block",
            category: "permanent",
            modifiers: [
              {
                type: "MODIFY_POWER",
                target: {
                  type: "CHARACTER",
                  filter: { controller: "OPPONENT" },
                },
                params: { amount: -1000 },
              },
            ],
          } as never,
        ],
      } as EffectSchema,
      "TEST-409",
    );
    expect(errors.some((e) => e.includes("'controller' inside target.filter"))).toBe(true);
  });

  it("flags controller inside a prohibition's target filter", () => {
    const errors = validateEffectSchema(
      {
        card_id: "TEST-409",
        card_name: "Test",
        card_type: "Character",
        effects: [
          {
            id: "opt409-prohibition-block",
            category: "permanent",
            prohibitions: [
              {
                type: "CANNOT_ATTACK",
                target: {
                  type: "CHARACTER",
                  filter: { controller: "SELF" },
                },
              },
            ],
          } as never,
        ],
      } as EffectSchema,
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

describe("OPT-409: lint-schemas.sh rule C5", () => {
  it("reports C5 for action, nested any_of, and modifier filter violations", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "opt409-lint-"));
    try {
      writeFileSync(join(fixtureDir, "fixture.ts"), `
export const BAD_ACTION_FILTER: EffectSchema = {
  card_id: "TEST-C5-A",
  card_name: "Bad Action",
  card_type: "Character",
  effects: [{
    id: "bad_action",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [{
      type: "KO",
      target: { type: "CHARACTER", count: { exact: 1 }, filter: { any_of: [{ any_of: [{ controller: "OPPONENT" }] }] } },
    }],
  }],
};
export const BAD_MODIFIER_FILTER: EffectSchema = {
  card_id: "TEST-C5-B",
  card_name: "Bad Modifier",
  card_type: "Character",
  effects: [{
    id: "bad_modifier",
    category: "permanent",
    modifiers: [{
      type: "MODIFY_POWER",
      target: { type: "CHARACTER", filter: { controller: "OPPONENT" } },
      params: { amount: -1000 },
    }],
  }],
};
`);
      const linter = resolve(__dirname, "../engine/schemas/lint-schemas.sh");
      let output = "";
      try {
        output = execFileSync("node", [linter, join(fixtureDir, "fixture.ts")], {
          encoding: "utf8",
        });
      } catch (e) {
        // Linter exits 1 when errors are found — the output still carries them.
        output = (e as { stdout?: string }).stdout ?? "";
      }
      const c5Lines = output.split("\n").filter((line) => line.includes("C5"));
      expect(c5Lines.some((line) => line.includes("TEST-C5-A"))).toBe(true);
      expect(c5Lines.some((line) => line.includes("TEST-C5-B"))).toBe(true);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
