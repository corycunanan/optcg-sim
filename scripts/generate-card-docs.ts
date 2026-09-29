/**
 * Adds missing effect-bearing cards to docs/cards/<SET>.md from the canonical
 * vegapull card JSON.
 *
 * A card is documented when it has real effect text OR real Trigger text, so
 * Trigger-only cards (effect "-", trigger present) get a heading with a
 * `**Trigger:**` line. Printed wording is copied from the canonical JSON via
 * sanitizeEffectText (the same normalization the card-text manifest uses,
 * including <br> -> newline); nothing is synthesized from authored schemas.
 *
 * Additive by design: blocks already present in a set file are preserved
 * byte-for-byte (older docs carry hand-reviewed wording and legacy attribute
 * rendering) and only missing card IDs are inserted in ID order. A missing
 * set file is created from scratch.
 *
 * The canonical JSON is gitignored and REQUIRED: a missing input directory is a
 * hard failure, never a silent skip. Offline coverage is enforced separately by
 * workers/game/scripts/check-card-doc-coverage.ts against the committed manifest.
 *
 * Run: npx tsx scripts/generate-card-docs.ts [--input <json dir>] [--out <docs dir>]
 *   --input  default: $CARD_DOCS_INPUT or data/vegapull-full/json
 *   --out    default: docs/cards
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sanitizeEffectText } from "../shared/effect-text";

interface CanonicalCard {
  id: string;
  name: string;
  category: string;
  colors?: string[];
  effect?: unknown;
  trigger?: unknown;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputDir = resolve(
  argValue("--input") ?? process.env.CARD_DOCS_INPUT ?? "data/vegapull-full/json",
);
const outputDir = resolve(argValue("--out") ?? "docs/cards");
const variantSuffix = /_(?:p|r)\d+$/i;
const headingIdPattern = /^\*\*([A-Z0-9]+-\d+)\*\*/m;

function realText(value: unknown, context: string): string {
  return typeof value === "string" ? sanitizeEffectText(value, context) : "";
}

/** "OP09-001" -> "OP-09"; promo cards ("P-001") live in UNKNOWN.md. */
function setLabel(cardId: string): string {
  const match = cardId.match(/^([A-Z]+)(\d+)-/);
  return match ? `${match[1]}-${match[2]}` : "UNKNOWN";
}

function renderBlock(id: string, card: CanonicalCard): string | null {
  const effect = realText(card.effect, `${id}.effect`);
  const trigger = realText(card.trigger, `${id}.trigger`);
  if (!effect && !trigger) return null;

  const lines = [
    `## ${sanitizeEffectText(card.name, `${id}.name`)}`,
    `**${id}** · ${card.category} · ${(card.colors ?? []).join("/")}\n`,
  ];
  if (effect) lines.push(effect);
  if (trigger) lines.push(`${effect ? "\n" : ""}**Trigger:** ${trigger}`);
  lines.push("\n---");
  return lines.join("\n");
}

function main(): void {
  if (!existsSync(inputDir)) {
    console.error(
      `Canonical card JSON not found at ${inputDir}. Pass --input <dir> or set CARD_DOCS_INPUT.`,
    );
    process.exit(1);
  }
  const files = readdirSync(inputDir)
    .filter((file) => /^cards_.*\.json$/.test(file))
    .sort();
  if (files.length === 0) {
    console.error(`No cards_*.json files in ${inputDir}.`);
    process.exit(1);
  }

  // Base printing wins; alternate/reprint variants only fill gaps.
  const byId = new Map<string, CanonicalCard>();
  for (const file of files) {
    const cards = JSON.parse(readFileSync(join(inputDir, file), "utf8")) as CanonicalCard[];
    for (const card of cards) {
      const id = card.id.replace(variantSuffix, "");
      if (!byId.has(id) || card.id === id) byId.set(id, card);
    }
  }

  const wanted = new Map<string, Array<[string, string]>>();
  for (const id of [...byId.keys()].sort()) {
    const block = renderBlock(id, byId.get(id)!);
    if (!block) continue;
    const label = setLabel(id);
    const group = wanted.get(label) ?? [];
    group.push([id, block]);
    wanted.set(label, group);
  }

  mkdirSync(outputDir, { recursive: true });
  const added: string[] = [];
  for (const [label, entries] of wanted) {
    const path = join(outputDir, `${label}.md`);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : `# ${label}\n\n`;
    const parts = existing.split(/(?=^## )/m);
    const header = parts.shift() ?? "";
    const blocks = parts.map((raw) => ({
      id: raw.match(headingIdPattern)?.[1] ?? "",
      text: raw.trimEnd(),
    }));
    const present = new Set(blocks.map((block) => block.id));

    for (const [id, text] of entries) {
      if (present.has(id)) continue;
      const at = blocks.findIndex((block) => block.id > id);
      blocks.splice(at === -1 ? blocks.length : at, 0, { id, text });
      added.push(id);
    }

    const rendered = `${header}${blocks.map((block) => block.text).join("\n\n")}\n`;
    if (rendered !== existing) writeFileSync(path, rendered);
  }
  console.log(`Added ${added.length} card(s) to ${outputDir}: ${added.join(" ")}`);
}

main();
