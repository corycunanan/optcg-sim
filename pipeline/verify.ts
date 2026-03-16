/**
 * Step 6: Verify import results.
 *
 * Counts records in the database and spot-checks known cards.
 */

import type { PrismaClient } from "@prisma/client";
import type { BaseCard, ArtVariantEntry } from "./classify";
import type { CardSetEntry } from "./build-set-membership";

export async function verify(
  prisma: PrismaClient,
  expectedBaseCards: BaseCard[],
  expectedVariants: ArtVariantEntry[],
  expectedCardSets: CardSetEntry[]
): Promise<void> {
  // Count records
  const cardCount = await prisma.card.count();
  const variantCount = await prisma.artVariant.count();
  const cardSetCount = await prisma.cardSet.count();

  console.log(`  Database counts:`);
  console.log(
    `    Cards:        ${cardCount} (expected ${expectedBaseCards.length})`
  );
  console.log(
    `    Art variants: ${variantCount} (expected ${expectedVariants.length})`
  );
  console.log(
    `    Card sets:    ${cardSetCount} (expected ${expectedCardSets.length})`
  );

  // Verify counts match
  const issues: string[] = [];

  if (cardCount !== expectedBaseCards.length) {
    issues.push(
      `Card count mismatch: ${cardCount} vs expected ${expectedBaseCards.length}`
    );
  }
  if (variantCount !== expectedVariants.length) {
    // OP07-091_p1 is duplicated in vegapull source data — 1 fewer is expected
    const diff = expectedVariants.length - variantCount;
    if (diff <= 1) {
      console.log(
        `    ℹ Variant count ${variantCount} (${diff} skipped as duplicate — expected)`
      );
    } else {
      issues.push(
        `Variant count mismatch: ${variantCount} vs expected ${expectedVariants.length}`
      );
    }
  }
  if (cardSetCount !== expectedCardSets.length) {
    issues.push(
      `CardSet count mismatch: ${cardSetCount} vs expected ${expectedCardSets.length}`
    );
  }

  // Spot-check known cards
  console.log(`  Spot-checking known cards...`);

  const spotChecks = [
    {
      id: "ST01-001",
      name: "Monkey.D.Luffy",
      type: "Leader",
      color: "Red",
    },
    {
      id: "OP01-001",
      name: "Roronoa Zoro",
      type: "Leader",
      color: "Red",
    },
    {
      id: "OP01-025",
      name: "Roronoa Zoro",
      type: "Character",
      color: "Red",
    },
  ];

  for (const check of spotChecks) {
    const card = await prisma.card.findUnique({
      where: { id: check.id },
      include: {
        artVariants: true,
        cardSets: true,
      },
    });

    if (!card) {
      issues.push(`Spot-check FAIL: ${check.id} not found`);
      continue;
    }

    if (card.name !== check.name) {
      issues.push(
        `Spot-check FAIL: ${check.id} name = "${card.name}" (expected "${check.name}")`
      );
    }

    if (card.type !== check.type) {
      issues.push(
        `Spot-check FAIL: ${check.id} type = "${card.type}" (expected "${check.type}")`
      );
    }

    if (!card.color.includes(check.color)) {
      issues.push(
        `Spot-check FAIL: ${check.id} color = ${JSON.stringify(card.color)} (expected to include "${check.color}")`
      );
    }

    console.log(
      `    ✓ ${check.id} (${card.name}) — ${card.artVariants.length} variants, ${card.cardSets.length} sets`
    );
  }

  // Check for cards with missing critical fields
  const missingEffect = await prisma.card.count({
    where: {
      effectText: "",
      type: { not: "Leader" },
    },
  });

  const missingImage = await prisma.card.count({
    where: { imageUrl: "" },
  });

  if (missingImage > 0) {
    issues.push(`${missingImage} cards have empty imageUrl`);
  }

  console.log(`    Vanilla cards (empty effect): ${missingEffect}`);

  // Type distribution
  const typeDistribution = await prisma.card.groupBy({
    by: ["type"],
    _count: true,
  });
  console.log(`  Type distribution:`);
  for (const t of typeDistribution) {
    console.log(`    ${t.type}: ${t._count}`);
  }

  // Block distribution
  const blockDistribution = await prisma.card.groupBy({
    by: ["blockNumber"],
    _count: true,
    orderBy: { blockNumber: "asc" },
  });
  console.log(`  Block distribution:`);
  for (const b of blockDistribution) {
    console.log(`    Block ${b.blockNumber}: ${b._count}`);
  }

  // Report issues
  if (issues.length > 0) {
    console.log();
    console.log(`  ⚠ ${issues.length} issues found:`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
  } else {
    console.log(`  ✅ All checks passed!`);
  }
}
