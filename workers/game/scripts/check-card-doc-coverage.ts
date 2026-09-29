/**
 * Offline card-doc coverage gate (OPT-830).
 *
 * Every effect-bearing card in the COMMITTED card-text manifest (real effect
 * text or Trigger text) must have a `**<ID>**` heading in docs/cards/*.md.
 * Reads only committed files, so it runs in CI without the gitignored
 * canonical vegapull JSON. Fix omissions with:
 *   npx tsx scripts/generate-card-docs.ts   (from the repo root; needs the JSON)
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ManifestFacts {
  hasRealEffectText: boolean;
  hasTriggerText: boolean;
}

const docIdPattern = /^\*\*([A-Z0-9]+-\d+)\*\*/gm;

export function collectDocumentedIds(docs: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const content of docs) {
    for (const match of content.matchAll(docIdPattern)) ids.add(match[1]);
  }
  return ids;
}

/** Effect-bearing manifest IDs with no doc heading, sorted. */
export function findUndocumentedCards(
  manifest: Record<string, ManifestFacts>,
  docs: Iterable<string>,
): string[] {
  const documented = collectDocumentedIds(docs);
  return Object.entries(manifest)
    .filter(([, facts]) => facts.hasRealEffectText || facts.hasTriggerText)
    .map(([id]) => id)
    .filter((id) => !documented.has(id))
    .sort();
}

function main(): void {
  const workerRoot = process.cwd();
  const manifest = JSON.parse(
    readFileSync(resolve(workerRoot, "src/engine/card-text-manifest.generated.json"), "utf8"),
  ) as Record<string, ManifestFacts>;
  const docsDir = resolve(workerRoot, "../../docs/cards");
  const docs = readdirSync(docsDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => readFileSync(resolve(docsDir, file), "utf8"));

  const missing = findUndocumentedCards(manifest, docs);
  if (missing.length > 0) {
    console.error(
      `docs/cards is missing ${missing.length} effect-bearing card(s) from the card-text manifest: ${missing.join(", ")}.\n` +
        "Run `npx tsx scripts/generate-card-docs.ts` from the repo root (needs data/vegapull-full/json).",
    );
    process.exitCode = 1;
    return;
  }
  console.log("Card docs cover every effect-bearing manifest card.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
