import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import {
  findSchemaCardTypeCategoryViolations,
  type CardTextManifest,
} from "../engine/trigger-schema-coverage.js";

const manifest = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../engine/card-text-manifest.generated.json"),
    "utf8"
  )
) as CardTextManifest;

describe("OPT-593 canonical card category coverage", () => {
  it("requires every authored schema card_type to match its canonical category", () => {
    expect(
      findSchemaCardTypeCategoryViolations(manifest, getAllAuthoredSchemas())
    ).toEqual([]);
  });

  it("reports a schema whose card_type disagrees with the manifest", () => {
    const syntheticManifest: CardTextManifest = {
      "TEST-CATEGORY": {
        category: "Leader",
        hasRealEffectText: true,
        hasTriggerText: false,
      },
    };
    const mismatchedSchema: EffectSchema = {
      card_id: "TEST-CATEGORY",
      card_type: "Character",
      effects: [],
    };

    expect(
      findSchemaCardTypeCategoryViolations(syntheticManifest, {
        "TEST-CATEGORY": mismatchedSchema,
      })
    ).toEqual([
      'TEST-CATEGORY: schema card_type "Character" does not match canonical category "Leader"',
    ]);
  });
});
