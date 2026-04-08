/**
 * GET  /api/decks — List current user's decks
 * POST /api/decks — Create a new deck
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CreateDeckSchema } from "@/lib/validators/decks";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decks = await prisma.deck.findMany({
      where: { userId: session.user.id },
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

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Deck list error:", error);
    return NextResponse.json({ error: "Failed to list decks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limited } = await apiLimiter.check(`deck-create:${session.user.id}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const parsed = await parseBody(request, CreateDeckSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { name, leaderId, leaderArtUrl, sleeveUrl, donArtUrl, testOrder, format, cards } = parsed;

    // Verify leader exists and is a Leader type
    const leader = await prisma.card.findUnique({ where: { id: leaderId } });
    if (!leader) {
      return NextResponse.json({ error: "Leader card not found" }, { status: 404 });
    }
    if (leader.type !== "Leader") {
      return NextResponse.json({ error: "Selected card is not a Leader" }, { status: 400 });
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
        userId: session.user.id,
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

    return NextResponse.json({ data: deck }, { status: 201 });
  } catch (error) {
    console.error("Deck create error:", error);
    return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
  }
}
