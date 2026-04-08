/**
 * GET  /api/decks — List current user's decks
 * POST /api/decks — Create a new deck
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { CreateDeckSchema } from "@/lib/validators/decks";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  try {
    const decks = await prisma.deck.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        cards: {
          include: { card: { select: { id: true, name: true, color: true, type: true, imageUrl: true } } },
        },
      },
    });

    // Fetch leader card images in bulk
    const leaderIds = [...new Set(decks.map((d) => d.leaderId))];
    const leaderCards = await prisma.card.findMany({
      where: { id: { in: leaderIds } },
      select: { id: true, name: true, imageUrl: true },
    });
    const leaderMap = new Map(leaderCards.map((c) => [c.id, c]));

    // Transform to include computed fields
    const data = decks.map((deck) => {
      const totalCards = deck.cards.reduce((sum, dc) => sum + dc.quantity, 0);
      const colors = new Set<string>();
      deck.cards.forEach((dc) => dc.card.color.forEach((c) => colors.add(c)));
      const leader = leaderMap.get(deck.leaderId);

      return {
        id: deck.id,
        name: deck.name,
        leaderId: deck.leaderId,
        leaderName: leader?.name ?? null,
        leaderImageUrl: deck.leaderArtUrl ?? leader?.imageUrl ?? null,
        format: deck.format,
        totalCards,
        colors: Array.from(colors),
        coverImage: deck.cards[0]?.card.imageUrl ?? null,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
      };
    });

    return apiSuccess(data);
  } catch (error) {
    console.error("Deck list error:", error);
    return apiError("Failed to list decks", 500);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`deck-create:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, CreateDeckSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { name, leaderId, leaderArtUrl, sleeveUrl, donArtUrl, testOrder, format, cards } = parsed;

    // Verify leader exists and is a Leader type
    const leader = await prisma.card.findUnique({ where: { id: leaderId } });
    if (!leader) {
      return apiError("Leader card not found", 404);
    }
    if (leader.type !== "Leader") {
      return apiError("Selected card is not a Leader", 400);
    }

    const deck = await prisma.deck.create({
      data: {
        name,
        leaderId,
        leaderArtUrl: leaderArtUrl ?? null,
        sleeveUrl: sleeveUrl ?? null,
        donArtUrl: donArtUrl ?? null,
        testOrder: testOrder ?? Prisma.JsonNull,
        format: format || "Standard",
        userId,
        cards: cards?.length
          ? {
              createMany: {
                data: cards.map((c) => ({
                  cardId: c.cardId,
                  quantity: c.quantity,
                  selectedArtUrl: c.selectedArtUrl ?? null,
                })),
              },
            }
          : undefined,
      },
      include: {
        cards: {
          include: {
            card: {
              select: {
                id: true,
                name: true,
                color: true,
                type: true,
                cost: true,
                power: true,
                counter: true,
                imageUrl: true,
                banStatus: true,
                blockNumber: true,
                traits: true,
                attribute: true,
                effectText: true,
                triggerText: true,
                rarity: true,
              },
            },
          },
        },
      },
    });

    return apiSuccess(deck, 201);
  } catch (error) {
    console.error("Deck create error:", error);
    return apiError("Failed to create deck", 500);
  }
}
