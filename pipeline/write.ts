/**
 * Step 5: Write transformed data to PostgreSQL via Prisma.
 *
 * Uses upsert for idempotent imports — safe to re-run.
 */

import type { PrismaClient } from "@prisma/client";
import type { BaseCard } from "./classify";
import type { ArtVariantEntry } from "./classify";
import type { CardSetEntry } from "./build-set-membership";

export interface WriteResult {
  cardsUpserted: number;
  variantsCreated: number;
  cardSetsCreated: number;
}

const BATCH_SIZE = 100;

export async function writeToDatabase(
  prisma: PrismaClient,
  baseCards: BaseCard[],
  artVariants: ArtVariantEntry[],
  cardSets: CardSetEntry[]
): Promise<WriteResult> {
  let cardsUpserted = 0;
  let variantsCreated = 0;
  let cardSetsCreated = 0;

  // ─── Upsert base cards in batches ─────────────────────────

  console.log(`  Upserting ${baseCards.length} cards...`);
  for (let i = 0; i < baseCards.length; i += BATCH_SIZE) {
    const batch = baseCards.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((card) =>
        prisma.card.upsert({
          where: { id: card.id },
          create: {
            id: card.id,
            originSet: card.originSet,
            name: card.name,
            type: card.type,
            color: card.color,
            cost: card.cost,
            life: card.life,
            power: card.power,
            counter: card.counter,
            attribute: card.attribute,
            traits: card.traits,
            rarity: card.rarity,
            effectText: card.effectText,
            triggerText: card.triggerText,
            imageUrl: card.imageUrl,
            blockNumber: card.blockNumber,
            isReprint: card.isReprint,
          },
          update: {
            name: card.name,
            type: card.type,
            color: card.color,
            cost: card.cost,
            life: card.life,
            power: card.power,
            counter: card.counter,
            attribute: card.attribute,
            traits: card.traits,
            rarity: card.rarity,
            effectText: card.effectText,
            triggerText: card.triggerText,
            // imageUrl intentionally excluded — preserve CDN URLs set by migrate-images
            blockNumber: card.blockNumber,
          },
        })
      )
    );

    cardsUpserted += batch.length;
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= baseCards.length) {
      console.log(
        `    Cards: ${Math.min(i + BATCH_SIZE, baseCards.length)}/${baseCards.length}`
      );
    }
  }

  // ─── Clear existing art variants and card sets, then re-create ─

  // Delete existing card sets for a clean import (variants use upsert to preserve CDN imageUrls)
  console.log(`  Clearing existing card sets...`);
  await prisma.cardSet.deleteMany({});

  // ─── Upsert art variants in batches ───────────────────────

  console.log(`  Upserting ${artVariants.length} art variants...`);
  for (let i = 0; i < artVariants.length; i += BATCH_SIZE) {
    const batch = artVariants.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((v) =>
        prisma.artVariant.upsert({
          where: { variantId: v.variantId },
          create: {
            cardId: v.cardId,
            variantId: v.variantId,
            label: v.label,
            rarity: v.rarity,
            imageUrl: v.imageUrl,
            set: v.set,
          },
          update: {
            cardId: v.cardId,
            label: v.label,
            rarity: v.rarity,
            // imageUrl intentionally excluded — preserve CDN URLs set by migrate-images
            set: v.set,
          },
        })
      )
    );

    variantsCreated += batch.length;
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= artVariants.length) {
      console.log(
        `    Variants: ${Math.min(i + BATCH_SIZE, artVariants.length)}/${artVariants.length}`
      );
    }
  }

  // ─── Create card set entries in batches ───────────────────

  console.log(`  Creating ${cardSets.length} card-set entries...`);
  for (let i = 0; i < cardSets.length; i += BATCH_SIZE) {
    const batch = cardSets.slice(i, i + BATCH_SIZE);

    await prisma.cardSet.createMany({
      data: batch.map((cs) => ({
        cardId: cs.cardId,
        packId: cs.packId,
        setLabel: cs.setLabel,
        setName: cs.setName,
        isOrigin: cs.isOrigin,
      })),
      skipDuplicates: true,
    });

    cardSetsCreated += batch.length;
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= cardSets.length) {
      console.log(
        `    Card sets: ${Math.min(i + BATCH_SIZE, cardSets.length)}/${cardSets.length}`
      );
    }
  }

  return { cardsUpserted, variantsCreated, cardSetsCreated };
}
