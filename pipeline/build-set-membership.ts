/**
 * Step 4: Build card ↔ set membership (many-to-many).
 *
 * For each transformed card entry (base, parallel, reprint), we create a
 * CardSet record linking the base card ID to the pack it appears in.
 * The `isOrigin` flag is true when the card's ID prefix matches the pack's label.
 */

import type { TransformedCard } from "./transform";
import type { PackMap } from "./load";

export interface CardSetEntry {
  cardId: string;
  packId: string;
  setLabel: string;
  setName: string;
  isOrigin: boolean;
}

/**
 * Resolve a pack ID to its human-readable label and name.
 */
function resolvePackInfo(
  packId: string,
  packs: PackMap
): { label: string; name: string } {
  const pack = packs[packId];
  if (!pack) {
    return { label: `UNKNOWN-${packId}`, name: "Unknown Pack" };
  }

  const label = pack.title_parts.label || pack.raw_title;
  const name = pack.title_parts.title || pack.raw_title;
  return { label, name };
}

/**
 * Check if a card's origin set matches the pack label.
 * e.g. card "OP01-001" (originSet "OP-01") in pack labeled "OP-01" → isOrigin = true
 */
function isOriginPack(originSet: string, packLabel: string): boolean {
  // Direct match
  if (originSet === packLabel) return true;

  // Handle combined pack labels like "OP14-EB04" or "OP15-EB04"
  // A card with originSet "OP14" would match "OP14-EB04"
  if (packLabel.includes("-")) {
    const parts = packLabel.split("-");
    // Reconstruct possible set labels from the combined label
    // e.g. "OP14-EB04" → check if originSet starts with "OP-14" or "EB-04"
    for (const part of parts) {
      const partMatch = part.match(/^([A-Z]+)(\d+)$/);
      if (partMatch) {
        const reconstructed = `${partMatch[1]}-${partMatch[2]}`;
        if (originSet === reconstructed) return true;
      }
    }
  }

  return false;
}

export function buildSetMembership(
  transformedCards: TransformedCard[],
  packs: PackMap
): CardSetEntry[] {
  // Deduplicate: one entry per (baseId, packId) pair
  const seen = new Set<string>();
  const cardSets: CardSetEntry[] = [];

  for (const card of transformedCards) {
    const key = `${card.baseId}::${card.packId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const packInfo = resolvePackInfo(card.packId, packs);

    cardSets.push({
      cardId: card.baseId,
      packId: card.packId,
      setLabel: packInfo.label,
      setName: packInfo.name,
      isOrigin: isOriginPack(card.originSet, packInfo.label),
    });
  }

  // Stats
  const originCount = cardSets.filter((cs) => cs.isOrigin).length;
  const nonOriginCount = cardSets.length - originCount;
  console.log(`  Origin entries:     ${originCount}`);
  console.log(`  Non-origin entries: ${nonOriginCount}`);

  return cardSets;
}
