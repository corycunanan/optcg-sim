/**
 * Drift guards for the effect-schema sync (pipeline/sync-effect-schemas.ts).
 *
 * Card.effectSchema is a derived copy of the authored schemas in
 * workers/game/src/engine/schemas/. These tests guard the code halves of that
 * contract in CI (the DB half is guarded by `pnpm pipeline:sync-schemas --check`):
 *
 * 1. The extraction produces schemas that app-side deck validation actually
 *    consumes (round-trip: authored file → sync shape → validation helpers).
 * 2. Every authored DECK_RESTRICTION stays within the filter vocabulary that
 *    validation.ts's matcher understands. The matcher silently ignores unknown
 *    keys, so an unguarded new key would ship wrong legality with no error.
 */

import { describe, expect, it } from "vitest";

import { buildDesiredEffectSchemas } from "../../pipeline/sync-effect-schemas";
import {
  allowsUnlimitedCopies,
  collectDeckRestrictionRules,
  collectRuleModifications,
} from "../lib/deck-builder/validation";

const desired = buildDesiredEffectSchemas();

// Filter keys matchesDeckRestrictionFilter in validation.ts understands.
// If this test fails after authoring a new DECK_RESTRICTION, extend the
// matcher (and this list) before shipping the schema — the matcher ignores
// unknown keys, which corrupts legality in both directions.
const SUPPORTED_FILTER_KEYS = new Set(["cost_min", "card_type", "traits"]);
const SUPPORTED_RESTRICTIONS = new Set(["CANNOT_INCLUDE", "ONLY_INCLUDE"]);

describe("effect schema sync", () => {
  it("extracts unlimited-copy overrides that validation consumes", () => {
    for (const cardId of ["OP01-075", "OP08-072", "OP16-042"]) {
      const schema = desired.get(cardId);
      expect(schema, `${cardId} should have a synced schema`).toBeDefined();
      expect(
        allowsUnlimitedCopies({ effectSchema: schema }),
        `${cardId} should allow unlimited copies`
      ).toBe(true);
    }
  });

  it("extracts leader deck restrictions that validation consumes", () => {
    for (const cardId of ["OP12-001", "OP13-079", "P-117"]) {
      const schema = desired.get(cardId);
      expect(schema, `${cardId} should have a synced schema`).toBeDefined();
      expect(
        collectDeckRestrictionRules({ effectSchema: schema }).length,
        `${cardId} should yield at least one deck restriction rule`
      ).toBeGreaterThan(0);
    }
  });

  it("round-trips every synced schema through the validation collector", () => {
    for (const [cardId, schema] of desired) {
      expect(
        collectRuleModifications(schema).length,
        `${cardId}'s synced schema should be readable by collectRuleModifications`
      ).toBe(schema.rule_modifications.length);
    }
  });

  it("keeps every authored DECK_RESTRICTION within the app matcher's vocabulary", () => {
    for (const [cardId, schema] of desired) {
      for (const mod of schema.rule_modifications) {
        if (mod.rule_type !== "DECK_RESTRICTION") continue;

        expect(
          SUPPORTED_RESTRICTIONS.has(mod.restriction as string),
          `${cardId} uses restriction "${String(mod.restriction)}" — extend validation.ts before authoring it`
        ).toBe(true);

        const filter = mod.filter as Record<string, unknown>;
        for (const key of Object.keys(filter)) {
          expect(
            SUPPORTED_FILTER_KEYS.has(key),
            `${cardId} uses filter key "${key}" that matchesDeckRestrictionFilter ignores — extend the matcher in validation.ts first`
          ).toBe(true);
        }
      }
    }
  });
});
