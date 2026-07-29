import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sanitizeEffectText } from "../../../shared/effect-text.js";

export type CanonicalCardCategory = "Character" | "Event" | "Leader" | "Stage";

interface CanonicalCardTextFacts {
  category: CanonicalCardCategory;
  hasRealEffectText: boolean;
  hasTriggerText: boolean;
}

type CardTextManifest = Record<string, CanonicalCardTextFacts>;

interface CanonicalCardRecord {
  id: string;
  category: unknown;
  effect?: unknown;
  trigger?: unknown;
}

const workerRoot = resolve(process.cwd());
const canonicalDataDirectory = resolve(
  workerRoot,
  "../../data/vegapull-full/json"
);
const outputPath = resolve(
  workerRoot,
  "src/engine/card-text-manifest.generated.json"
);
const canonicalCardSuffixPattern = /_(?:p|r)\d+$/i;
const cardDataFilePattern = /^cards_.*\.json$/;

function canonicalizeCardId(cardId: string): string {
  return cardId.replace(canonicalCardSuffixPattern, "");
}

function hasRealText(value: unknown): boolean {
  return (
    typeof value === "string" && value.trim().length > 0 && value.trim() !== "-"
  );
}

export function hasLeadingTriggerTag(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const normalized = sanitizeEffectText(value);
  return normalized.split(/\r?\n/).some((line) => {
    const leadingTagRun = line.match(/^\s*((?:\[[^\]\r\n]+\]\s*)+)/)?.[1];
    return leadingTagRun ? /\[Trigger\]/i.test(leadingTagRun) : false;
  });
}

function isCanonicalCardCategory(
  value: unknown
): value is CanonicalCardCategory {
  return (
    value === "Character" ||
    value === "Event" ||
    value === "Leader" ||
    value === "Stage"
  );
}

function buildManifest(): CardTextManifest {
  const manifest = new Map<string, CanonicalCardTextFacts>();
  const files = readdirSync(canonicalDataDirectory)
    .filter((file) => cardDataFilePattern.test(file))
    .sort();

  for (const file of files) {
    const cards = JSON.parse(
      readFileSync(resolve(canonicalDataDirectory, file), "utf8")
    ) as CanonicalCardRecord[];
    for (const card of cards) {
      const cardId = canonicalizeCardId(card.id);
      if (!isCanonicalCardCategory(card.category)) {
        throw new Error(
          `${card.id}: unsupported canonical category ${JSON.stringify(card.category)}`
        );
      }
      const previous = manifest.get(cardId) ?? {
        category: card.category,
        hasRealEffectText: false,
        hasTriggerText: false,
      };
      if (previous.category !== card.category) {
        throw new Error(
          `${cardId}: canonical variants disagree on category (${previous.category} vs ${card.category})`
        );
      }
      const effectText =
        typeof card.effect === "string"
          ? sanitizeEffectText(card.effect, `${card.id}.effect`)
          : "";
      const triggerText =
        typeof card.trigger === "string"
          ? sanitizeEffectText(card.trigger, `${card.id}.trigger`)
          : "";
      manifest.set(cardId, {
        category: card.category,
        hasRealEffectText:
          previous.hasRealEffectText || hasRealText(effectText),
        hasTriggerText:
          previous.hasTriggerText ||
          hasRealText(triggerText) ||
          hasLeadingTriggerTag(effectText),
      });
    }
  }

  return Object.fromEntries(
    [...manifest.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function render(manifest: CardTextManifest): string {
  const entries = Object.entries(manifest).map(
    ([cardId, facts]) => `  ${JSON.stringify(cardId)}: ${JSON.stringify(facts)}`
  );
  return `{\n${entries.join(",\n")}\n}\n`;
}

function main(): void {
  if (!existsSync(canonicalDataDirectory)) {
    console.log(
      "Canonical card JSON is unavailable; card-text manifest refresh skipped."
    );
    return;
  }

  const rendered = render(buildManifest());
  if (process.argv.includes("--check")) {
    const current = readFileSync(outputPath, "utf8");
    if (current !== rendered) {
      console.error(
        "Generated card-text manifest is stale. Run pnpm schema:generate."
      );
      process.exitCode = 1;
    } else {
      console.log("Generated card-text manifest is current.");
    }
    return;
  }

  writeFileSync(outputPath, rendered);
  console.log(`Generated ${outputPath}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
