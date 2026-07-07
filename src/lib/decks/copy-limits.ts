/**
 * Server-side copy-limit enforcement for deck save payloads.
 *
 * The Zod deck schemas allow quantities up to 50 so unlimited-copy cards
 * (COPY_LIMIT_OVERRIDE) can be saved; this check keeps ordinary cards at the
 * schema-aware limit so bypassing the deck-builder UI can't persist an
 * over-limit deck.
 */

import { prisma } from "@/lib/db";
import {
  DEFAULT_COPY_LIMIT,
  getDeckCardCopyLimit,
} from "@/lib/deck-builder/validation";

export interface DeckCardQuantity {
  cardId: string;
  quantity: number;
}

/**
 * Returns the card IDs whose quantity exceeds their copy limit. Only hits the
 * DB when some card is over the default limit; unknown card IDs get the
 * default limit (over-limit quantities of nonexistent cards are violations).
 */
export async function findCopyLimitViolations(
  cards: DeckCardQuantity[]
): Promise<string[]> {
  const overDefault = cards.filter((c) => c.quantity > DEFAULT_COPY_LIMIT);
  if (overDefault.length === 0) return [];

  const rows = await prisma.card.findMany({
    where: { id: { in: overDefault.map((c) => c.cardId) } },
    select: { id: true, effectSchema: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  return overDefault
    .filter(
      (c) => c.quantity > getDeckCardCopyLimit(byId.get(c.cardId) ?? {})
    )
    .map((c) => c.cardId);
}
