/**
 * POST /api/decks/import — Parse a deck list and validate card IDs
 * 
 * Accepts: { text: string } — deck list in Nx CARDID format
 * Returns: parsed cards, leader, errors for invalid lines
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ImportDeckSchema } from "@/lib/validators/decks";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";

interface ParsedLine {
  line: number;
  raw: string;
  cardId: string | null;
  quantity: number;
  error: string | null;
}

function parseDeckList(text: string): ParsedLine[] {
  const lines = text.split("\n").map((l) => l.trim());
  const results: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Skip empty lines and comments
    if (!raw || raw.startsWith("//") || raw.startsWith("#")) continue;

    // Skip section headers: "Leader", "Character (40)", "Event (10)", etc.
    // These are lines with no card ID — either a bare word/phrase or word with (count)
    if (/^[A-Za-z][A-Za-z\s!!]*(?:\s*\(\d+\))?$/.test(raw)) continue;

    // Format: "N Card Name (CARD-ID)" — e.g. "4 Izo (ST22-002)"
    const namedMatch = raw.match(
      /^(\d+)\s+.+\(([A-Z]{2,}\d+-\d+)\)\s*$/i,
    );
    if (namedMatch) {
      const quantity = parseInt(namedMatch[1]);
      const cardId = namedMatch[2].toUpperCase();
      if (quantity < 1 || quantity > 4) {
        results.push({ line: i + 1, raw, cardId, quantity, error: `Invalid quantity: ${quantity} (must be 1-4)` });
      } else {
        results.push({ line: i + 1, raw, cardId, quantity, error: null });
      }
      continue;
    }

    // Try to parse: "Nx CARDID", "NxCARDID", "N CARDID", or just "CARDID"
    const match = raw.match(
      /^(?:(\d+)\s*[xX×]\s*)?([A-Z]{2,}\d+-\d+)(?:\s.*)?$/i,
    );

    if (!match) {
      // Try leader line format: "Leader: CARDID"
      const leaderMatch = raw.match(
        /^(?:leader|ldr)\s*[:=]\s*([A-Z]{2,}\d+-\d+)/i,
      );
      if (leaderMatch) {
        results.push({
          line: i + 1,
          raw,
          cardId: leaderMatch[1].toUpperCase(),
          quantity: 1,
          error: null,
        });
      } else {
        results.push({
          line: i + 1,
          raw,
          cardId: null,
          quantity: 0,
          error: `Could not parse line: "${raw}"`,
        });
      }
      continue;
    }

    const quantity = match[1] ? parseInt(match[1]) : 1;
    const cardId = match[2].toUpperCase();

    if (quantity < 1 || quantity > 4) {
      results.push({
        line: i + 1,
        raw,
        cardId,
        quantity,
        error: `Invalid quantity: ${quantity} (must be 1-4)`,
      });
      continue;
    }

    results.push({ line: i + 1, raw, cardId, quantity, error: null });
  }

  return results;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    return NextResponse.json({
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
    return NextResponse.json(
      { error: "Failed to parse deck list" },
      { status: 500 },
    );
  }
}
