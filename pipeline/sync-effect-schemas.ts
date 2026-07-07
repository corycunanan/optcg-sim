/**
 * Step 7: Sync deck-legality rule modifications into Card.effectSchema.
 *
 * The authored schema files in workers/game/src/engine/schemas/ are the
 * source of truth for card effect encodings. The game engine bundles them
 * directly (schema-registry.ts prefers authored schemas over DB values), but
 * app-side deck validation reads Card.effectSchema from Postgres. This step
 * materializes the deck-legality-relevant subset — rule modifications only,
 * not full effect encodings — so validation sees the same rules the engine
 * enforces without shipping every schema to the client.
 *
 * Usage:
 *   pnpm pipeline:sync-schemas            # write pending changes
 *   pnpm pipeline:sync-schemas --check    # exit 1 if DB is out of sync (no writes)
 *   pnpm pipeline:sync-schemas --dry-run  # print pending changes (no writes)
 *
 * Also runs as the final step of pipeline/import.ts, so a fresh import can
 * never leave the column unpopulated.
 */

import { pathToFileURL } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { getAllAuthoredSchemas } from "../workers/game/src/engine/schema-registry";
import { collectRuleModifications } from "../src/lib/deck-builder/validation";

const BATCH_SIZE = 100;

export interface SyncResult {
  updated: string[];
  cleared: string[];
  unchanged: number;
  missingInDb: string[];
}

export type DesiredEffectSchema = {
  rule_modifications: Record<string, unknown>[];
};

/**
 * The subset of each authored schema that deck validation consumes, keyed by
 * card ID. Cards whose schema carries no rule modifications are omitted —
 * their DB column should be NULL.
 */
export function buildDesiredEffectSchemas(): Map<string, DesiredEffectSchema> {
  const desired = new Map<string, DesiredEffectSchema>();
  for (const [cardId, schema] of Object.entries(getAllAuthoredSchemas())) {
    const mods = collectRuleModifications(schema);
    if (mods.length > 0) {
      desired.set(cardId, { rule_modifications: mods });
    }
  }
  return desired;
}

/** Stable stringify (sorted keys) — Postgres jsonb does not preserve key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function syncEffectSchemas(
  prisma: PrismaClient,
  { write }: { write: boolean }
): Promise<SyncResult> {
  const desired = buildDesiredEffectSchemas();
  const rows = await prisma.card.findMany({
    select: { id: true, effectSchema: true },
  });
  const dbIds = new Set(rows.map((row) => row.id));

  const updated: string[] = [];
  const cleared: string[] = [];
  let unchanged = 0;

  for (const row of rows) {
    const want = desired.get(row.id) ?? null;
    const have = row.effectSchema ?? null;
    if (canonicalJson(want) === canonicalJson(have)) {
      unchanged++;
    } else if (want) {
      updated.push(row.id);
    } else {
      cleared.push(row.id);
    }
  }

  const missingInDb = [...desired.keys()].filter((id) => !dbIds.has(id)).sort();
  updated.sort();
  cleared.sort();

  if (write) {
    const changes = [
      ...updated.map((id) => ({ id, value: desired.get(id) ?? null })),
      ...cleared.map((id) => ({ id, value: null })),
    ];
    for (let i = 0; i < changes.length; i += BATCH_SIZE) {
      const batch = changes.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map(({ id, value }) =>
          prisma.card.update({
            where: { id },
            data: {
              effectSchema: value
                ? (value as Prisma.InputJsonValue)
                : Prisma.DbNull,
            },
          })
        )
      );
    }
  }

  return { updated, cleared, unchanged, missingInDb };
}

function printResult(result: SyncResult, write: boolean) {
  const verb = write ? "" : " (pending)";
  console.log(`  Updated${verb}:   ${result.updated.length}`);
  if (result.updated.length > 0) {
    console.log(`    ${result.updated.join(", ")}`);
  }
  console.log(`  Cleared${verb}:   ${result.cleared.length}`);
  if (result.cleared.length > 0) {
    console.log(`    ${result.cleared.join(", ")}`);
  }
  console.log(`  Unchanged:  ${result.unchanged}`);
  if (result.missingInDb.length > 0) {
    console.log(
      `  ⚠ Authored rule modifications for ${result.missingInDb.length} card(s) not in this DB (set not imported yet?):`
    );
    console.log(`    ${result.missingInDb.join(", ")}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const dryRun = args.includes("--dry-run");
  const write = !check && !dryRun;

  console.log("━━━ Effect schema sync ━━━");
  console.log(`  Mode: ${check ? "check" : dryRun ? "dry run" : "write"}`);

  const prisma = new PrismaClient();
  try {
    const result = await syncEffectSchemas(prisma, { write });
    printResult(result, write);

    const pending = result.updated.length + result.cleared.length;
    if (check && pending > 0) {
      console.error(
        `✗ Card.effectSchema is out of sync with authored schemas (${pending} change(s) pending). Run: pnpm pipeline:sync-schemas`
      );
      process.exit(1);
    }
    if (pending === 0) {
      console.log("✅ Card.effectSchema is in sync");
    } else if (write) {
      console.log(`✅ Synced ${pending} card(s)`);
    } else {
      console.log(`${pending} change(s) pending — run without --dry-run to apply`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    console.error("Effect schema sync failed:", err);
    process.exit(1);
  });
}
