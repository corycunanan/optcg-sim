/**
 * Schema lint: when a replacement effect's card text says "other than
 * [<self>]", the schema's target_filter must explicitly exclude the source
 * card. Without the exclusion, the source will match its own filter and
 * self-protect — a silent rule violation.
 *
 * Accepted forms of exclusion (any satisfies):
 *   - `target_filter.exclude_self: true`
 *   - `target_filter.exclude_name` === `card_name`
 *   - every `any_of` branch individually excludes self
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

function textRequiresSelfExclusion(cardText: string, cardName: string): boolean {
  const needle = `other than [${cardName}]`.toLowerCase();
  return replacementSentences(cardText).some((s) => s.toLowerCase().includes(needle));
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
  for (const block of schema.effects as EffectBlock[]) {
    if (block.category !== "replacement") continue;
    const filter = block.replaces?.target_filter;
    if (!filter) continue; // "self only" fallback — safe by construction
    if (!textRequiresSelfExclusion(cardText, schema.card_name)) continue;
    if (ALLOWLIST.some((a) => a.cardId === schema.card_id && a.blockId === block.id)) continue;
    if (filterExcludesSelf(filter, schema.card_name)) continue;
    failures.push({
      cardId: schema.card_id,
      cardName: schema.card_name,
      blockId: block.id,
      reason: `Card text says "other than [${schema.card_name}]" but target_filter omits exclude_self / exclude_name.`,
    });
  }
  return failures;
}

describe("schema lint: replacement self-exclusion", () => {
  const cardEffects = parseCardEffects();
  const schemas = getAllAuthoredSchemas();

  it("every replacement whose text says 'other than [<self>]' excludes self in its target_filter", () => {
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
