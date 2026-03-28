#!/usr/bin/env node
/**
 * One-time script: patches docs/cards/*.md files to include card type and color
 * on the card ID line. Transforms:
 *   **EB03-001**
 * into:
 *   **EB03-001** · Leader · Blue/Purple
 *
 * Reads card metadata from Prisma (PostgreSQL), then patches the markdown files.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  // 1. Fetch all cards with id, type, and color
  const cards = await prisma.card.findMany({
    select: { id: true, type: true, color: true },
  });

  // Build lookup: card_id (e.g. "EB03-001") → { type, color }
  const lookup = new Map();
  for (const card of cards) {
    lookup.set(card.id, {
      type: card.type,        // "Leader" | "Character" | "Event" | "Stage"
      color: card.color.join("/"), // ["Blue", "Purple"] → "Blue/Purple"
    });
  }

  console.log(`Loaded ${lookup.size} cards from database`);

  // 2. Patch each docs/cards/*.md file
  const cardsDir = join(process.cwd(), "docs/cards");
  const files = readdirSync(cardsDir).filter((f) => f.endsWith(".md"));

  let totalPatched = 0;
  let totalMissing = 0;

  for (const file of files) {
    const filePath = join(cardsDir, file);
    const content = readFileSync(filePath, "utf-8");

    // Match lines like **EB03-001** (with no existing metadata after it)
    const patched = content.replace(
      /^\*\*([A-Z0-9]+-\d+)\*\*$/gm,
      (match, cardId) => {
        const meta = lookup.get(cardId);
        if (!meta) {
          console.warn(`  MISSING: ${cardId} not found in database`);
          totalMissing++;
          return match; // leave unchanged
        }
        totalPatched++;
        return `**${cardId}** · ${meta.type} · ${meta.color}`;
      }
    );

    if (patched !== content) {
      writeFileSync(filePath, patched);
      console.log(`  Patched: ${file}`);
    }
  }

  console.log(`\nDone: ${totalPatched} cards patched, ${totalMissing} missing`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
