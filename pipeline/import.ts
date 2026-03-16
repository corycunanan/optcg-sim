/**
 * OPTCG Data Import Pipeline
 *
 * Loads vegapull JSON output, transforms it to our Prisma schema,
 * and upserts to PostgreSQL.
 *
 * Usage: pnpm pipeline:import [--data-dir <path>] [--dry-run]
 *
 * See docs/DATA-PIPELINE.md for full pipeline design.
 */

import { PrismaClient } from "@prisma/client";
import { loadVegapullData } from "./load";
import { transformCards } from "./transform";
import { classifyEntries } from "./classify";
import { buildSetMembership } from "./build-set-membership";
import { writeToDatabase } from "./write";
import { verify } from "./verify";

const DEFAULT_DATA_DIR = "data/vegapull-full/json";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dataDirIdx = args.indexOf("--data-dir");
  const dataDir =
    dataDirIdx !== -1 ? args[dataDirIdx + 1] : DEFAULT_DATA_DIR;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   OPTCG Data Import Pipeline             ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Data directory: ${dataDir}`);
  console.log(`  Dry run:        ${dryRun}`);
  console.log();

  // Step 1: Load vegapull JSON
  console.log("━━━ Step 1: Loading vegapull data ━━━");
  const { packs, rawCards } = await loadVegapullData(dataDir);
  console.log(`  Loaded ${Object.keys(packs).length} packs`);
  console.log(`  Loaded ${rawCards.length} card entries`);
  console.log();

  // Step 2: Transform fields to our schema
  console.log("━━━ Step 2: Transforming card data ━━━");
  const transformedCards = transformCards(rawCards, packs);
  console.log(`  Transformed ${transformedCards.length} entries`);
  console.log();

  // Step 3: Classify variants and build base cards
  console.log("━━━ Step 3: Classifying variants ━━━");
  const { baseCards, artVariants, reprints } =
    classifyEntries(transformedCards);
  console.log(`  Base cards:     ${baseCards.length}`);
  console.log(`  Art variants:   ${artVariants.length}`);
  console.log(`  Reprints:       ${reprints.length}`);
  console.log();

  // Step 4: Build set membership
  console.log("━━━ Step 4: Building set membership ━━━");
  const cardSets = buildSetMembership(transformedCards, packs);
  console.log(`  Card-set entries: ${cardSets.length}`);
  console.log();

  if (dryRun) {
    console.log("━━━ Dry run complete — no database writes ━━━");
    console.log();
    printSummary(baseCards, artVariants, reprints, cardSets);
    return;
  }

  // Step 5: Write to database
  console.log("━━━ Step 5: Writing to database ━━━");
  const prisma = new PrismaClient();
  try {
    const writeResult = await writeToDatabase(
      prisma,
      baseCards,
      artVariants,
      cardSets
    );
    console.log(`  Cards upserted:      ${writeResult.cardsUpserted}`);
    console.log(`  Art variants created: ${writeResult.variantsCreated}`);
    console.log(`  Card sets created:    ${writeResult.cardSetsCreated}`);
    console.log();

    // Step 6: Verify
    console.log("━━━ Step 6: Verifying ━━━");
    await verify(prisma, baseCards, artVariants, cardSets);
  } finally {
    await prisma.$disconnect();
  }

  console.log();
  console.log("✅ Pipeline complete!");
}

function printSummary(
  baseCards: unknown[],
  artVariants: unknown[],
  reprints: unknown[],
  cardSets: unknown[]
) {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Pipeline Summary                       ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Base cards:        ${String(baseCards.length).padStart(5)}              ║`);
  console.log(`║  Art variants:      ${String(artVariants.length).padStart(5)}              ║`);
  console.log(`║  Reprints:          ${String(reprints.length).padStart(5)}              ║`);
  console.log(`║  Card-set entries:  ${String(cardSets.length).padStart(5)}              ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
