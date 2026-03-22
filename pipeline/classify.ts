/**
 * Step 3: Classify entries into base cards, art variants, and reprints.
 *
 * - Base cards (no suffix): canonical Card records
 * - Parallel variants (_p suffix): ArtVariant records with different art
 * - Reprints (_r suffix): set membership only (same art, different product)
 *
 * For each base card ID, we take the "base" entry as canonical.
 * If a card ID only appears as variants (rare edge case), we use the first entry.
 */

import type { TransformedCard } from "./transform";

export interface BaseCard {
  id: string;
  originSet: string;
  name: string;
  type: "Leader" | "Character" | "Event" | "Stage";
  color: string[];
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  attribute: string[];
  traits: string[];
  rarity: string;
  effectText: string;
  triggerText: string | null;
  imageUrl: string;
  blockNumber: number;
  isReprint: boolean;
}

export interface ArtVariantEntry {
  cardId: string;
  variantId: string;
  label: string;
  rarity: string;
  imageUrl: string;
  set: string;
}

export interface ReprintEntry {
  cardId: string;
  vegapullId: string;
  packId: string;
  imageUrl: string;
}

/**
 * Infer a human-readable label for an art variant.
 */
function inferVariantLabel(
  rarity: string,
  vegapullId: string
): string {
  // Extract the suffix number
  const suffixMatch = vegapullId.match(/_p(\d+)$/);
  const suffixNum = suffixMatch ? parseInt(suffixMatch[1]) : 1;

  // Use rarity for specific variant types
  const rarityLower = rarity.toLowerCase();
  if (rarityLower.includes("secret")) return "Secret Rare";
  if (rarityLower.includes("treasure")) return "Treasure Rare";
  if (rarityLower.includes("special")) return "Special";
  if (rarityLower.includes("promo")) return "Promo";

  // Default: Parallel + number if > 1
  return suffixNum > 1 ? `Parallel ${suffixNum}` : "Parallel";
}

export function classifyEntries(transformedCards: TransformedCard[]): {
  baseCards: BaseCard[];
  artVariants: ArtVariantEntry[];
  reprints: ReprintEntry[];
} {
  // Group by base card ID
  const grouped = new Map<string, TransformedCard[]>();
  for (const card of transformedCards) {
    const group = grouped.get(card.baseId) || [];
    group.push(card);
    grouped.set(card.baseId, group);
  }

  const baseCards: BaseCard[] = [];
  const artVariants: ArtVariantEntry[] = [];
  const reprints: ReprintEntry[] = [];
  const warnings: string[] = [];

  for (const [baseId, entries] of grouped) {
    // Find the canonical base entry (no suffix)
    const baseEntry = entries.find((e) => e.variantType === "base");

    if (!baseEntry) {
      // Edge case: card ID only appears as variants
      warnings.push(`${baseId}: no base entry found, using first variant`);
      const first = entries[0];
      baseCards.push({
        id: baseId,
        originSet: first.originSet,
        name: first.name,
        type: first.type,
        color: first.color,
        cost: first.cost,
        life: first.life,
        power: first.power,
        counter: first.counter,
        attribute: first.attribute,
        traits: first.traits,
        rarity: first.rarity,
        effectText: first.effectText,
        triggerText: first.triggerText,
        imageUrl: first.imageUrl,
        blockNumber: first.blockNumber,
        isReprint: false,
      });
    } else {
      // Check if this card's origin set matches its ID prefix
      // (isReprint = card first appeared in a different product than its ID suggests)
      baseCards.push({
        id: baseId,
        originSet: baseEntry.originSet,
        name: baseEntry.name,
        type: baseEntry.type,
        color: baseEntry.color,
        cost: baseEntry.cost,
        life: baseEntry.life,
        power: baseEntry.power,
        counter: baseEntry.counter,
        attribute: baseEntry.attribute,
        traits: baseEntry.traits,
        rarity: baseEntry.rarity,
        effectText: baseEntry.effectText,
        triggerText: baseEntry.triggerText,
        imageUrl: baseEntry.imageUrl,
        blockNumber: baseEntry.blockNumber,
        isReprint: false,
      });
    }

    // Classify remaining entries
    for (const entry of entries) {
      if (entry.variantType === "base") continue;

      if (entry.variantType === "parallel") {
        artVariants.push({
          cardId: baseId,
          variantId: entry.vegapullId,
          label: inferVariantLabel(entry.rarity, entry.vegapullId),
          rarity: entry.rarity,
          imageUrl: entry.imageUrl,
          set: entry.packId,
        });
      } else if (entry.variantType === "reprint") {
        reprints.push({
          cardId: baseId,
          vegapullId: entry.vegapullId,
          packId: entry.packId,
          imageUrl: entry.imageUrl,
        });
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`  ⚠ Warnings:`);
    for (const w of warnings) {
      console.log(`    - ${w}`);
    }
  }

  return { baseCards, artVariants, reprints };
}
