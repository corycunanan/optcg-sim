/**
 * GET  /api/decks — List current user's decks
 * POST /api/decks — Create a new deck
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

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

    // Transform to include computed fields
    const data = decks.map((deck) => {
      const totalCards = deck.cards.reduce((sum, dc) => sum + dc.quantity, 0);
      const colors = new Set<string>();
      deck.cards.forEach((dc) => dc.card.color.forEach((c) => colors.add(c)));

      return {
        id: deck.id,
        name: deck.name,
        leaderId: deck.leaderId,
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

  try {
    const body = await request.json();
    const { name, leaderId, leaderArtUrl, format, cards } = body as {
      name: string;
      leaderId: string;
      leaderArtUrl?: string | null;
      format?: string;
      cards?: { cardId: string; quantity: number }[];
    };

    if (!name || !leaderId) {
      return NextResponse.json(
        { error: "Name and leaderId are required" },
        { status: 400 },
      );
    }

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
        format: format || "Standard",
        userId: session.user.id,
        cards: cards?.length
          ? {
              createMany: {
                data: cards.map((c) => ({
                  cardId: c.cardId,
                  quantity: c.quantity,
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

    return NextResponse.json(deck, { status: 201 });
  } catch (error) {
    console.error("Deck create error:", error);
    return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
  }
}
