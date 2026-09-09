/**
 * Step 8: Sync authored Tier 1 facets into Card.effectTags and
 * Card.effectTraits.
 *
 * Usage:
 *   pnpm pipeline:sync-facets            # write pending changes
 *   pnpm pipeline:sync-facets --check    # exit 1 if DB is out of sync
 *   pnpm pipeline:sync-facets --dry-run  # print pending changes without writes
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { extractCardFacets } from "./effect-facets";
import { stripVariantSuffix } from "../shared/card-parsing";
import { getAllAuthoredSchemas } from "../workers/game/src/engine/schema-registry";
import type { EffectSchema } from "../workers/game/src/engine/effect-types";

const BATCH_SIZE = 100;

export interface DesiredFacets {
  effectTags: string[];
  effectTraits: string[];
}

export interface SyncResult {
  updated: string[];
  cleared: string[];
  unchanged: number;
  missingInDb: string[];
  resolvedVariantIds: string[];
}

export type SyncMode = "check" | "dry-run" | "write";

export function effectFacetSyncExitCode(
  mode: SyncMode,
  result: SyncResult
): number {
  const pending = result.updated.length + result.cleared.length;
  return mode === "check" && pending > 0 ? 1 : 0;
}

function canonicalStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
}

/** Build canonical Tier 1 facets keyed by base card ID. */
export function buildDesiredFacets(
  authoredSchemas: Record<string, EffectSchema> = getAllAuthoredSchemas()
): Map<string, DesiredFacets> {
  const collected = new Map<
    string,
    { effectTags: string[]; effectTraits: string[] }
  >();

  for (const [authoredId, schema] of Object.entries(authoredSchemas)) {
    const cardId = stripVariantSuffix(authoredId);
    const current = collected.get(cardId) ?? {
      effectTags: [],
      effectTraits: [],
    };
    const extracted = extractCardFacets(schema);

    current.effectTags.push(...extracted.tags);
    for (const reference of extracted.effectTraits) {
      if (reference.role !== "exclude") {
        current.effectTraits.push(reference.trait);
      }
    }
    collected.set(cardId, current);
  }

  return new Map(
    [...collected].map(([cardId, facets]) => [
      cardId,
      {
        effectTags: canonicalStrings(facets.effectTags),
        effectTraits: canonicalStrings(facets.effectTraits),
      },
    ])
  );
}

function equalArrays(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** Compare persisted card facets with the authored corpus. */
export async function syncEffectFacets(
  prisma: PrismaClient,
  options: {
    mode: SyncMode;
    authoredSchemas?: Record<string, EffectSchema>;
  }
): Promise<SyncResult> {
  const authoredSchemas = options.authoredSchemas ?? getAllAuthoredSchemas();
  const desired = buildDesiredFacets(authoredSchemas);
  const resolvedVariantIds = Object.keys(authoredSchemas)
    .filter((authoredId) => stripVariantSuffix(authoredId) !== authoredId)
    .map((authoredId) => `${authoredId} -> ${stripVariantSuffix(authoredId)}`)
    .sort();
  const rows = await prisma.card.findMany({
    select: { id: true, effectTags: true, effectTraits: true },
  });
  const dbIds = new Set(rows.map((row) => row.id));
  const updated: string[] = [];
  const cleared: string[] = [];
  let unchanged = 0;

  for (const row of rows) {
    const want = desired.get(row.id) ?? { effectTags: [], effectTraits: [] };
    if (
      equalArrays(row.effectTags, want.effectTags) &&
      equalArrays(row.effectTraits, want.effectTraits)
    ) {
      unchanged++;
    } else if (want.effectTags.length > 0 || want.effectTraits.length > 0) {
      updated.push(row.id);
    } else {
      cleared.push(row.id);
    }
  }

  const missingInDb = [...desired.keys()]
    .filter((cardId) => !dbIds.has(cardId))
    .sort();
  updated.sort();
  cleared.sort();

  if (options.mode === "write") {
    const changes = [
      ...updated.map((id) => ({ id, facets: desired.get(id)! })),
      ...cleared.map((id) => ({
        id,
        facets: { effectTags: [], effectTraits: [] },
      })),
    ];
    for (let index = 0; index < changes.length; index += BATCH_SIZE) {
      const batch = changes.slice(index, index + BATCH_SIZE);
      await prisma.$transaction(
        batch.map(({ id, facets }) =>
          prisma.card.update({ where: { id }, data: facets })
        )
      );
    }
  }

  return { updated, cleared, unchanged, missingInDb, resolvedVariantIds };
}

function printResult(result: SyncResult, mode: SyncMode): void {
  const pendingLabel = mode === "write" ? "" : " (pending)";
  console.log(`  Updated${pendingLabel}:   ${result.updated.length}`);
  if (result.updated.length > 0) {
    console.log(`    ${result.updated.join(", ")}`);
  }
  console.log(`  Cleared${pendingLabel}:   ${result.cleared.length}`);
  if (result.cleared.length > 0) {
    console.log(`    ${result.cleared.join(", ")}`);
  }
  console.log(`  Unchanged:  ${result.unchanged}`);
  if (result.missingInDb.length > 0) {
    console.log(
      `  ⚠ Authored facets for ${result.missingInDb.length} card(s) not in this DB (set not imported yet?):`
    );
    console.log(`    ${result.missingInDb.join(", ")}`);
  }
  if (result.resolvedVariantIds.length > 0) {
    console.log(
      `  ⚠ Authored variant schema IDs resolved to base cards: ${result.resolvedVariantIds.join(", ")}`
    );
  }
}

function modeFromArgs(args: readonly string[]): SyncMode {
  if (args.includes("--check")) return "check";
  if (args.includes("--dry-run")) return "dry-run";
  return "write";
}

async function main(): Promise<void> {
  const mode = modeFromArgs(process.argv.slice(2));
  console.log("━━━ Effect facet sync ━━━");
  console.log(`  Mode: ${mode === "dry-run" ? "dry run" : mode}`);

  const prisma = new PrismaClient();
  try {
    const result = await syncEffectFacets(prisma, { mode });
    printResult(result, mode);

    const pending = result.updated.length + result.cleared.length;
    const exitCode = effectFacetSyncExitCode(mode, result);
    if (exitCode !== 0) {
      console.error(
        `✗ Card effect facets are out of sync with authored schemas (${pending} change(s) pending). Run: pnpm pipeline:sync-facets`
      );
      process.exitCode = exitCode;
    } else if (pending === 0) {
      console.log("✅ Card effect facets are in sync");
    } else if (mode === "write") {
      console.log(`✅ Synced ${pending} card(s)`);
    } else {
      console.log(
        `${pending} change(s) pending — run without --dry-run to apply`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("Effect facet sync failed:", error);
    process.exitCode = 1;
  });
}
