/**
 * Generates markdown files for each set's cards with effects.
 * Excludes reprints and cards with no effect text.
 *
 * Run: npx tsx scripts/generate-card-docs.ts
 */

import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const prisma = new PrismaClient();
const OUTPUT_DIR = join(process.cwd(), "docs", "cards");

async function main() {
  console.log("Generating card effect docs...\n");

  const cards = await prisma.card.findMany({
    where: {
      isReprint: false,
      effectText: { not: "" },
    },
    select: {
      id: true,
      name: true,
      originSet: true,
      effectText: true,
      triggerText: true,
    },
    orderBy: [{ originSet: "asc" }, { id: "asc" }],
  });

  console.log(`Found ${cards.length} cards with effects (excluding reprints)`);

  const sets = new Map<string, typeof cards>();
  for (const card of cards) {
    const group = sets.get(card.originSet) ?? [];
    group.push(card);
    sets.set(card.originSet, group);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const sortedSets = [...sets.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  let totalFiles = 0;
  let totalCards = 0;

  for (const [setLabel, setCards] of sortedSets) {
    const filename = `${setLabel.replace(/[^a-zA-Z0-9-]/g, "")}.md`;
    const lines: string[] = [];

    lines.push(`# ${setLabel}\n`);

    for (const card of setCards) {
      lines.push(`## ${card.name}`);
      lines.push(`**${card.id}**\n`);
      lines.push(card.effectText);

      if (card.triggerText) {
        lines.push(`\n**Trigger:** ${card.triggerText}`);
      }

      lines.push("\n---\n");
      totalCards++;
    }

    const filepath = join(OUTPUT_DIR, filename);
    await writeFile(filepath, lines.join("\n"), "utf-8");
    console.log(`  ${filename} — ${setCards.length} cards`);
    totalFiles++;
  }

  console.log(`\nDone: ${totalFiles} files, ${totalCards} cards → docs/cards/`);
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
