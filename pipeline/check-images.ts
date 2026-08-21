/**
 * Hard gate for image hosting after pipeline:migrate-images.
 *
 * Usage: pnpm pipeline:check-images
 */

import { PrismaClient } from "@prisma/client";
import { selectPipelineDatabaseUrl } from "./database-url";
import { exitCodeFor, normalizeCdnUrl, summarizeOffCdn } from "./image-hosting";

async function main(): Promise<void> {
  const cdnUrl = normalizeCdnUrl(process.env.NEXT_PUBLIC_CDN_URL);
  if (!cdnUrl) {
    console.error("✕ NEXT_PUBLIC_CDN_URL unset — cannot check image hosting");
    process.exitCode = exitCodeFor(null);
    return;
  }

  const databaseConfig = selectPipelineDatabaseUrl();
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseConfig.url } },
  });

  console.log(`Database URL: ${databaseConfig.source}`);
  console.log(`CDN URL: ${cdnUrl}`);

  try {
    const [cards, variants] = await Promise.all([
      prisma.card.findMany({ select: { id: true, imageUrl: true } }),
      prisma.artVariant.findMany({
        select: { variantId: true, imageUrl: true },
      }),
    ]);
    const summary = summarizeOffCdn(
      cards,
      variants.map(({ variantId, imageUrl }) => ({
        id: variantId,
        imageUrl,
      })),
      cdnUrl
    );

    console.log(
      `Image hosting: ${summary.total} off CDN (${summary.cards.length} cards, ${summary.variants.length} variants)`
    );

    if (summary.total > 0) {
      console.error("Off-CDN images (first 20):");
      const rows = [
        ...summary.cards.map((row) => ({ type: "card", ...row })),
        ...summary.variants.map((row) => ({ type: "variant", ...row })),
      ];
      for (const row of rows.slice(0, 20)) {
        console.error(`  [${row.type}] ${row.id}: ${row.imageUrl}`);
      }
      if (rows.length > 20) {
        console.error(`  ... and ${rows.length - 20} more`);
      }
    } else {
      console.log(
        `✅ All ${cards.length + variants.length} images are on the CDN.`
      );
    }

    process.exitCode = exitCodeFor(summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Image hosting check failed:", error);
  process.exitCode = 1;
});
