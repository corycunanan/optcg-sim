/**
 * Step 5: Write transformed data to PostgreSQL via Prisma.
 *
 * Uses upsert for idempotent imports — safe to re-run.
 */

import type { PrismaClient } from "@prisma/client";
import type { BaseCard } from "./classify";
import type { ArtVariantEntry } from "./classify";
import type { CardSetEntry } from "./build-set-membership";
import { shouldReplaceStubImage } from "./image-fallback";

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

    // Allow one BATCH_SIZE upsert batch to complete over a remote connection.
    await prisma.$transaction(
      async (tx) => {
        const existingCards = await tx.card.findMany({
          where: { id: { in: batch.map((card) => card.id) } },
          select: { id: true, imageUrl: true },
        });
        const existingImageUrls = new Map(
          existingCards.map((card) => [card.id, card.imageUrl])
        );

        await Promise.all(
          batch.map((card) => {
            const existingImageUrl = existingImageUrls.get(card.id);
            const replaceStubImage =
              existingImageUrl !== undefined &&
              shouldReplaceStubImage(existingImageUrl, card);

            return tx.card.upsert({
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
                ...(replaceStubImage ? { imageUrl: card.imageUrl } : {}),
                // Otherwise preserve CDN URLs set by migrate-images.
                blockNumber: card.blockNumber,
              },
            });
          })
        );
      },
      { maxWait: 10_000, timeout: 120_000 }
    );

    cardsUpserted += batch.length;
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= baseCards.length) {
      console.log(
        `    Cards: ${Math.min(i + BATCH_SIZE, baseCards.length)}/${baseCards.length}`
      );
    }
  }

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

  console.log(`  Replacing ${cardSets.length} card-set entries atomically...`);
  const cardSetCreates = [];
  for (let i = 0; i < cardSets.length; i += BATCH_SIZE) {
    const batch = cardSets.slice(i, i + BATCH_SIZE);

    cardSetCreates.push(
      prisma.cardSet.createMany({
        data: batch.map((cs) => ({
          cardId: cs.cardId,
          packId: cs.packId,
          setLabel: cs.setLabel,
          setName: cs.setName,
          isOrigin: cs.isOrigin,
        })),
        skipDuplicates: true,
      })
    );
  }

  await prisma.$transaction([prisma.cardSet.deleteMany({}), ...cardSetCreates]);
  cardSetsCreated = cardSets.length;
  console.log(`    Card sets: ${cardSetsCreated}/${cardSets.length}`);

  return { cardsUpserted, variantsCreated, cardSetsCreated };
}
