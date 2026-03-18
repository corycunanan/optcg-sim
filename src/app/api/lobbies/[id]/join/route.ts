/**
 * POST /api/lobbies/[id]/join — Join a public lobby (select deck)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const { deckId } = await request.json() as { deckId: string };

    if (!deckId) {
      return NextResponse.json({ error: "deckId is required" }, { status: 400 });
    }

    const lobby = await prisma.lobby.findUnique({
      where: { id },
      include: { guest: true },
    });

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }
    if (lobby.status !== "WAITING") {
      return NextResponse.json({ error: "Lobby is not open" }, { status: 409 });
    }
    if (lobby.hostUserId === userId) {
      return NextResponse.json({ error: "You are the host" }, { status: 409 });
    }
    if (lobby.guest) {
      return NextResponse.json({ error: "Lobby is full" }, { status: 409 });
    }

    // Verify deck belongs to user
    const deck = await prisma.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.lobbyGuest.create({ data: { lobbyId: id, userId, deckId } }),
      prisma.lobby.update({ where: { id }, data: { status: "READY" } }),
    ]);

    const updated = await prisma.lobby.findUnique({
      where: { id },
      include: {
        host: { select: { id: true, username: true, name: true, image: true } },
        hostDeck: { select: { id: true, name: true, leaderId: true } },
        guest: {
          include: {
            user: { select: { id: true, username: true, name: true, image: true } },
            deck: { select: { id: true, name: true, leaderId: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Lobby join error:", error);
    return NextResponse.json({ error: "Failed to join lobby" }, { status: 500 });
  }
}
