/**
 * GET    /api/decks/[id] — Get a deck with full card list
 * PUT    /api/decks/[id] — Update a deck (name, leader, cards)
 * DELETE /api/decks/[id] — Delete a deck
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const CARD_SELECT = {
  id: true,
  name: true,
  color: true,
  type: true,
  cost: true,
  power: true,
  counter: true,
  life: true,
  imageUrl: true,
  banStatus: true,
  blockNumber: true,
  traits: true,
  attribute: true,
  effectText: true,
  triggerText: true,
  rarity: true,
  originSet: true,
} as const;

async function getDeckForUser(deckId: string, userId: string) {
  return prisma.deck.findFirst({
    where: { id: deckId, userId },
    include: {
      cards: {
        include: { card: { select: CARD_SELECT } },
        orderBy: { card: { cost: "asc" } },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deck = await getDeckForUser(id, session.user.id);
    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    // Also fetch the leader card details
    const leader = await prisma.card.findUnique({
      where: { id: deck.leaderId },
      select: CARD_SELECT,
    });

    return NextResponse.json({ ...deck, leader });
  } catch (error) {
    console.error("Deck fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch deck" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const existing = await prisma.deck.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, leaderId, leaderArtUrl, format, cards } = body as {
      name?: string;
      leaderId?: string;
      leaderArtUrl?: string | null;
      format?: string;
      cards?: { cardId: string; quantity: number }[];
    };

    // If changing leader, validate it
    if (leaderId && leaderId !== existing.leaderId) {
      const leader = await prisma.card.findUnique({ where: { id: leaderId } });
      if (!leader || leader.type !== "Leader") {
        return NextResponse.json({ error: "Invalid leader card" }, { status: 400 });
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (leaderId !== undefined) updateData.leaderId = leaderId;
    if (leaderArtUrl !== undefined) updateData.leaderArtUrl = leaderArtUrl;
    if (format !== undefined) updateData.format = format;

    // If cards are provided, replace all deck cards
    if (cards !== undefined) {
      await prisma.deckCard.deleteMany({ where: { deckId: id } });
      if (cards.length > 0) {
        await prisma.deckCard.createMany({
          data: cards.map((c) => ({
            deckId: id,
            cardId: c.cardId,
            quantity: c.quantity,
          })),
        });
      }
    }

    const deck = await prisma.deck.update({
      where: { id },
      data: updateData,
      include: {
        cards: {
          include: { card: { select: CARD_SELECT } },
          orderBy: { card: { cost: "asc" } },
        },
      },
    });

    const leader = await prisma.card.findUnique({
      where: { id: deck.leaderId },
      select: CARD_SELECT,
    });

    return NextResponse.json({ ...deck, leader });
  } catch (error) {
    console.error("Deck update error:", error);
    return NextResponse.json({ error: "Failed to update deck" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.deck.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    await prisma.deck.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Deck delete error:", error);
    return NextResponse.json({ error: "Failed to delete deck" }, { status: 500 });
  }
}
