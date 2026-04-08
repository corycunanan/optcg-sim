/**
 * POST /api/decks/import — Parse a deck list and validate card IDs
 *
 * Accepts: { text: string } — deck list in Nx CARDID format
 * Returns: parsed cards, leader, errors for invalid lines
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { ImportDeckSchema } from "@/lib/validators/decks";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

import { parseDeckList } from "@/lib/deck-builder/parser";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`deck-import:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const validated = await parseBody(request, ImportDeckSchema);
    if (isErrorResponse(validated)) return validated;
    const { text } = validated;

    const parsed = parseDeckList(text);
    const cardIds = [
      ...new Set(parsed.filter((p) => p.cardId).map((p) => p.cardId!)),
    ];

    // Verify all card IDs exist
    const existingCards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        cost: true,
        power: true,
        imageUrl: true,
        traits: true,
      },
    });

    const existingMap = new Map(existingCards.map((c) => [c.id, c]));

    // Annotate parsed lines with card data and mark not-found errors
    const results = parsed.map((p) => {
      if (p.error) return p;
      if (!p.cardId) return p;

      const card = existingMap.get(p.cardId);
      if (!card) {
        return { ...p, error: `Card not found: ${p.cardId}` };
      }

      return { ...p, card, error: null };
    });

    // Separate leader and main deck cards
    const validCards = results.filter((r) => !r.error && r.cardId);
    const leader = validCards.find(
      (r) => "card" in r && (r as { card: { type: string } }).card?.type === "Leader",
    );
    const mainDeck = validCards.filter(
      (r) => "card" in r && (r as { card: { type: string } }).card?.type !== "Leader",
    );
    const errors = results.filter((r) => r.error);

    return apiSuccess({
      leader: leader ? { cardId: leader.cardId, card: (leader as { card: unknown }).card } : null,
      cards: mainDeck.map((r) => ({
        cardId: r.cardId,
        quantity: r.quantity,
        card: (r as { card: unknown }).card,
      })),
      errors: errors.map((e) => ({
        line: e.line,
        raw: e.raw,
        error: e.error,
      })),
      totalLines: parsed.length,
    });
  } catch (error) {
    console.error("Deck import parse error:", error);
    return apiError("Failed to parse deck list", 500);
  }
}
