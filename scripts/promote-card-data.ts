/**
 * Dev-to-prod card-data promotion.
 *
 * Upsert-only: Card by id, CardSet by (cardId, packId), and ArtVariant by
 * variantId. No deletes; user data stays untouched. Dev UUIDs are not copied
 * to CardSet or ArtVariant rows.
 *
 * Errata is intentionally skipped because the model has no natural unique key.
 * Add a schema-backed natural key before promoting Errata with this script.
 *
 * Run: npx tsx scripts/promote-card-data.ts
 * Requires DEV_URL, PROD_URL, and PROD_ENDPOINT_HINT. Both URLs must use direct,
 * non-pooler database endpoints. PROD_ENDPOINT_HINT must identify the expected
 * production hostname.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const devUrl = process.env.DEV_URL;
const prodUrl = process.env.PROD_URL;
const prodEndpointHint = process.env.PROD_ENDPOINT_HINT;

if (!devUrl || !prodUrl) throw new Error("DEV_URL and PROD_URL required");
if (devUrl === prodUrl) throw new Error("dev and prod URLs are identical");
if (!prodEndpointHint) throw new Error("PROD_ENDPOINT_HINT required");

const devHostname = new URL(devUrl).hostname;
const prodHostname = new URL(prodUrl).hostname;
if (devHostname.includes("-pooler")) {
  throw new Error("DEV_URL must use a direct, non-pooler database endpoint");
}
if (prodHostname.includes("-pooler")) {
  throw new Error("PROD_URL must use a direct, non-pooler database endpoint");
}
if (!prodHostname.includes(prodEndpointHint)) {
  throw new Error(
    `PROD_URL hostname does not match PROD_ENDPOINT_HINT (${prodEndpointHint})`
  );
}

const dev = new PrismaClient({ datasources: { db: { url: devUrl } } });
const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } });

const CHUNK = 50;

async function inChunks<T>(
  rows: T[],
  fn: (row: T) => Promise<unknown>,
  label: string
) {
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(rows.slice(i, i + CHUNK).map(fn));
    done = Math.min(i + CHUNK, rows.length);
    if (done % 500 === 0 || done === rows.length) {
      console.log(`${label}: ${done}/${rows.length}`);
    }
  }
}

async function main() {
  const [cards, cardSets, variants, devErrataCount, prodBefore] =
    await Promise.all([
      dev.card.findMany(),
      dev.cardSet.findMany(),
      dev.artVariant.findMany(),
      dev.errata.count(),
      Promise.all([
        prod.card.count(),
        prod.cardSet.count(),
        prod.artVariant.count(),
        prod.errata.count(),
      ]),
    ]);

  console.log(
    `dev: ${cards.length} cards, ${cardSets.length} card_sets, ${variants.length} art_variants, ${devErrataCount} errata`
  );
  console.log(
    `prod before: ${prodBefore[0]} cards, ${prodBefore[1]} card_sets, ${prodBefore[2]} art_variants, ${prodBefore[3]} errata`
  );
  console.warn(
    `WARNING: skipping ${devErrataCount} dev errata rows because Errata has no natural unique key`
  );

  await inChunks(
    cards,
    (card) => {
      const { id, ...rest } = card;
      const effectSchema =
        card.effectSchema === null ? Prisma.DbNull : card.effectSchema;
      return prod.card.upsert({
        where: { id },
        create: { ...card, effectSchema },
        update: { ...rest, effectSchema },
      });
    },
    "cards"
  );

  await inChunks(
    cardSets,
    (cardSet) => {
      return prod.cardSet.upsert({
        where: {
          cardId_packId: {
            cardId: cardSet.cardId,
            packId: cardSet.packId,
          },
        },
        create: {
          cardId: cardSet.cardId,
          packId: cardSet.packId,
          setLabel: cardSet.setLabel,
          setName: cardSet.setName,
          isOrigin: cardSet.isOrigin,
        },
        update: {
          setLabel: cardSet.setLabel,
          setName: cardSet.setName,
          isOrigin: cardSet.isOrigin,
        },
      });
    },
    "card_sets"
  );

  await inChunks(
    variants,
    (variant) => {
      return prod.artVariant.upsert({
        where: { variantId: variant.variantId },
        create: {
          cardId: variant.cardId,
          variantId: variant.variantId,
          label: variant.label,
          rarity: variant.rarity,
          imageUrl: variant.imageUrl,
          set: variant.set,
        },
        update: {
          cardId: variant.cardId,
          label: variant.label,
          rarity: variant.rarity,
          imageUrl: variant.imageUrl,
          set: variant.set,
        },
      });
    },
    "art_variants"
  );

  const prodAfter = await Promise.all([
    prod.card.count(),
    prod.cardSet.count(),
    prod.artVariant.count(),
    prod.errata.count(),
  ]);
  console.log(
    `prod after: ${prodAfter[0]} cards, ${prodAfter[1]} card_sets, ${prodAfter[2]} art_variants, ${prodAfter[3]} errata`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dev.$disconnect();
    await prod.$disconnect();
  });
