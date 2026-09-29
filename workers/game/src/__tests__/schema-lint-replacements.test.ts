/**
 * Schema lint: when a replacement effect's card text says "other than
 * [<self>]", "other than this Character", or "other than this card",
 * the schema's target_filter must explicitly exclude the source
 * card. Without the exclusion, the source will match its own filter and
 * self-protect — a silent rule violation.
 *
 * Accepted forms of exclusion (any satisfies):
 *   - `target_filter.exclude_self: true`
 *   - `target_filter.exclude_name` === `card_name`
 *   - every `any_of` branch individually excludes self
 *
 * The converse (OPT-871): `exclude_self: true` / `exclude_name` === `card_name`
 * on a replacement `target_filter` requires the printed replacement sentence
 * to say "other than this Character" / "other than this card" /
 * "other than [<own name>]". An unprinted exclusion silently strips the
 * source's own protection. Only replacement `target_filter`s are in scope;
 * `exclude_self` on targets, costs, or conditions is not checked.
 *
 * Replacements with no `target_filter` are not checked — absence of a filter
 * means "self only" at runtime (see triggers.ts `appliesTo` fallback).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import type { EffectBlock, EffectSchema, TargetFilter } from "../engine/effect-types.js";
import { findReplacementControllerViolations } from "../engine/schema-replacement-controller-lint.js";
import { ST29_008_NAMI } from "../engine/schemas/st29.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DOCS_DIR = path.resolve(__dirname, "../../../../docs/cards");

/**
 * Allowlist — card_id + block_id pairs where the "other than [<name>]" match
 * is a false positive (e.g. the phrase appears in a non-replacement line of
 * the same card). Add entries with a one-line reason.
 */
const ALLOWLIST: Array<{ cardId: string; blockId: string; reason: string }> = [];

function parseCardEffects(): Map<string, string> {
  const effects = new Map<string, string>();
  const files = fs.readdirSync(CARDS_DOCS_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(CARDS_DOCS_DIR, file), "utf8");
    for (const block of content.split(/\n---\n/)) {
      const idMatch = block.match(/\*\*([A-Z0-9]+-[A-Z0-9]+)\*\*/);
      if (!idMatch) continue;
      const cardId = idMatch[1];
      const headerEndIdx = block.indexOf("\n\n", block.indexOf(idMatch[0]));
      if (headerEndIdx === -1) continue;
      const text = block.slice(headerEndIdx).trim();
      effects.set(cardId, text);
    }
  }
  return effects;
}

/**
 * Return the sentence(s) of the card text that reference a replacement
 * event ("would be K.O.", "would be removed", "would leave the field",
 * "would be rested", "would lose the game"). The lint check runs against
 * these sentences only, so a non-replacement search line mentioning
 * "other than [X]" elsewhere on the card won't trigger a false positive.
 */
function replacementSentences(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  return sentences.filter((s) => /\bwould be\b|\bwould leave\b|\bwould lose\b/i.test(s));
}

// Text is scoped per card, not per replacement block. No current card has
// multiple targeted replacement blocks; revisit if such a card is added.
function textPrintsSelfExclusion(cardText: string, cardName: string): boolean {
  const name = cardName.toLowerCase();
  return replacementSentences(cardText).some((s) => {
    const lower = s.toLowerCase();
    return (
      /\bother than this (character|card)\b/.test(lower) || lower.includes(`other than [${name}]`)
    );
  });
}

/** True when the filter (or any nested any_of branch) excludes the source. */
function filterMentionsSelfExclusion(filter: TargetFilter | undefined, cardName: string): boolean {
  if (!filter) return false;
  if (filter.exclude_self === true) return true;
  if (filter.exclude_name && filter.exclude_name === cardName) return true;
  return (filter.any_of ?? []).some((sub) => filterMentionsSelfExclusion(sub, cardName));
}

function filterExcludesSelf(filter: TargetFilter | undefined, cardName: string): boolean {
  if (!filter) return false;
  if (filter.exclude_self === true) return true;
  if (filter.exclude_name && filter.exclude_name === cardName) return true;
  if (filter.any_of && filter.any_of.length > 0) {
    return filter.any_of.every((sub) => filterExcludesSelf(sub, cardName));
  }
  return false;
}

interface LintFailure {
  cardId: string;
  cardName: string;
  blockId: string;
  reason: string;
}

function lintSchema(schema: EffectSchema, cardText: string): LintFailure[] {
  const failures: LintFailure[] = [];
  const cardId = schema.card_id ?? "UNKNOWN";
  const cardName = schema.card_name ?? cardId;
  for (const block of schema.effects as EffectBlock[]) {
    if (block.category !== "replacement") continue;
    const filter = block.replaces?.target_filter;
    if (!filter) continue; // "self only" fallback — safe by construction
    if (ALLOWLIST.some((a) => a.cardId === cardId && a.blockId === block.id)) continue;
    if (
      filterMentionsSelfExclusion(filter, cardName) &&
      !textPrintsSelfExclusion(cardText, cardName)
    ) {
      failures.push({
        cardId,
        cardName,
        blockId: block.id,
        reason: `target_filter excludes the source (exclude_self / exclude_name) but the printed replacement text has no "other than this Character" / "other than [${cardName}]" clause.`,
      });
    }
    if (!textPrintsSelfExclusion(cardText, cardName)) continue;
    if (filterExcludesSelf(filter, cardName)) continue;
    failures.push({
      cardId,
      cardName,
      blockId: block.id,
      reason: `Printed replacement text excludes the source ("other than this Character/card" or "other than [${cardName}]") but target_filter omits exclude_self / exclude_name.`,
    });
  }
  return failures;
}

describe("schema lint: replacement self-exclusion", () => {
  const cardEffects = parseCardEffects();
  const schemas = getAllAuthoredSchemas();

  it("every replacement whose printed text excludes self does so in its target_filter", () => {
    const failures: LintFailure[] = [];
    for (const [cardId, schema] of Object.entries(schemas)) {
      const text = cardEffects.get(cardId);
      if (!text) continue; // no doc entry — can't lint
      failures.push(...lintSchema(schema, text));
    }

    if (failures.length > 0) {
      const message = failures
        .map((f) => `  ${f.cardId} (${f.cardName}) :: ${f.blockId} — ${f.reason}`)
        .join("\n");
      throw new Error(`Schema lint found ${failures.length} replacement(s) missing self-exclusion:\n${message}`);
    }
    expect(failures).toEqual([]);
  });

  it("OP12-027 (printed 'other than this Character') keeps exclude_self and passes the lint", () => {
    const text = cardEffects.get("OP12-027");
    if (!text) throw new Error("OP12-027 card text missing from docs");
    const schema = schemas["OP12-027"];
    expect(schema.effects.some((e) => e.replaces?.target_filter?.exclude_self === true)).toBe(true);
    expect(lintSchema(schema, text)).toEqual([]);
  });

  it("regression: removing OP15-094's printed self-exclusion fails the lint", () => {
    const text = cardEffects.get("OP15-094");
    if (!text) throw new Error("OP15-094 card text missing from docs");
    const broken = structuredClone(schemas["OP15-094"]);
    expect(lintSchema(broken, text)).toEqual([]);
    const replacement = broken.effects.find((effect) => effect.category === "replacement");
    delete replacement!.replaces!.target_filter!.exclude_self;
    expect(lintSchema(broken, text)).toMatchObject([
      { cardId: "OP15-094", blockId: replacement!.id },
    ]);
  });

  it("regression: exclude_self without printed 'other than' text fails the lint", () => {
    const text = cardEffects.get("OP13-008");
    if (!text) throw new Error("OP13-008 card text missing from docs");
    const broken = structuredClone(schemas["OP13-008"]);
    broken.effects[0].replaces!.target_filter!.exclude_self = true;
    const failures = lintSchema(broken, text);
    expect(failures).toHaveLength(1);
    expect(failures[0].cardId).toBe("OP13-008");
    // Same schema without the exclusion passes.
    delete broken.effects[0].replaces!.target_filter!.exclude_self;
    expect(lintSchema(broken, text)).toEqual([]);
  });

  it("does not flag exclude_self outside replacement target_filters (targets, costs)", () => {
    const schema: EffectSchema = {
      card_id: "LINT-OUT-OF-SCOPE",
      card_name: "Out Of Scope",
      card_type: "Character",
      effects: [
        {
          id: "search",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [
            { type: "KO", target: { type: "CHARACTER", controller: "SELF", filter: { exclude_self: true } } } as never,
          ],
        },
      ],
    };
    expect(lintSchema(schema, "[On Play] K.O. up to 1 of your Characters other than this Character.")).toEqual([]);
  });

  it("sanity: parses at least 40 card-doc files and 20 replacement schemas", () => {
    expect(cardEffects.size).toBeGreaterThan(500); // docs cover the whole catalog
    const replacementCount = Object.values(schemas).reduce(
      (n, s) => n + s.effects.filter((e) => e.category === "replacement").length,
      0,
    );
    expect(replacementCount).toBeGreaterThanOrEqual(20);
  });

  it("regression: removing Tashigi's exclude_name would fail the lint", () => {
    // Synthesize a broken OP10-032 schema and run the lint against it directly.
    // Confirms the check actually fires — protects against false-green drift.
    const tashigiText = cardEffects.get("OP10-032");
    if (!tashigiText) throw new Error("OP10-032 card text missing from docs");

    const broken: EffectSchema = {
      card_id: "OP10-032",
      card_name: "Tashigi",
      card_type: "Character",
      effects: [
        {
          id: "replacement_protect_green_characters",
          category: "replacement",
          replaces: {
            event: "WOULD_BE_REMOVED_FROM_FIELD",
            target_filter: { color: "GREEN", card_type: "CHARACTER" }, // exclude_name removed
            cause_filter: { by: "OPPONENT_EFFECT" },
          },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          flags: { optional: true },
        },
      ],
    };

    const failures = lintSchema(broken, tashigiText);
    expect(failures).toHaveLength(1);
    expect(failures[0].cardId).toBe("OP10-032");
  });
});

// ─── OPT-800: replacement target_filter must declare controller ─────────────

describe("schema lint: replacement target_filter controller (OPT-800)", () => {
  function replacementSchema(targetFilter?: TargetFilter): EffectSchema {
    return {
      card_id: "LINT-TEST",
      card_name: "Lint Test",
      card_type: "Character",
      effects: [
        {
          id: "replacement",
          category: "replacement",
          replaces: {
            event: "WOULD_BE_KO",
            ...(targetFilter ? { target_filter: targetFilter } : {}),
          },
          replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }],
          flags: { optional: true },
        },
      ],
    };
  }

  it("every authored replacement target_filter declares a controller", () => {
    const failures = Object.values(getAllAuthoredSchemas()).flatMap(findReplacementControllerViolations);
    expect(failures).toEqual([]);
  });

  it("fails a target_filter that omits controller", () => {
    const failures = findReplacementControllerViolations(
      replacementSchema({ card_type: "CHARACTER", traits: ["Egghead"] }),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^LINT-TEST replacement: /);
  });

  it("exempts a self-only replacement (no target_filter)", () => {
    expect(findReplacementControllerViolations(replacementSchema())).toEqual([]);
  });

  it.each(["SELF", "OPPONENT", "EITHER", "ANY"] as const)("accepts an explicit %s controller", (controller) => {
    expect(
      findReplacementControllerViolations(replacementSchema({ controller, card_type: "CHARACTER" })),
    ).toEqual([]);
  });

  it("walks nested replacement definitions (granted blocks inside actions)", () => {
    const nested = replacementSchema().effects[0];
    const schema: EffectSchema = {
      card_id: "LINT-NESTED",
      card_name: "Lint Nested",
      card_type: "Event",
      effects: [
        {
          id: "grant",
          category: "auto",
          trigger: { keyword: "MAIN_EVENT" },
          actions: [
            {
              type: "GRANT_EFFECT",
              params: {
                effect: {
                  ...nested,
                  id: "granted_replacement",
                  replaces: { event: "WOULD_BE_KO", target_filter: { card_type: "CHARACTER" } },
                },
              },
            } as never,
          ],
        },
      ],
    };
    const failures = findReplacementControllerViolations(schema);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^LINT-NESTED granted_replacement: /);
  });

  it("regression: removing ST29-008's controller fails the lint", () => {
    expect(findReplacementControllerViolations(ST29_008_NAMI)).toEqual([]);
    const broken = structuredClone(ST29_008_NAMI);
    delete broken.effects[0].replaces!.target_filter!.controller;
    expect(findReplacementControllerViolations(broken)).toHaveLength(1);
  });
});
