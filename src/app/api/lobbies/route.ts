/**
 * GET  /api/lobbies — List public WAITING lobbies
 * POST /api/lobbies — Create a lobby
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const LOBBY_INCLUDE = {
  host: { select: { id: true, username: true, name: true, image: true } },
  hostDeck: { select: { id: true, name: true, leaderId: true } },
  guest: {
    include: {
      user: { select: { id: true, username: true, name: true, image: true } },
      deck: { select: { id: true, name: true, leaderId: true } },
    },
  },
  invites: {
    where: { status: "PENDING" as const },
    include: { user: { select: { id: true, username: true, name: true, image: true } } },
  },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lobbies = await prisma.lobby.findMany({
      where: { status: "WAITING", visibility: "PUBLIC" },
      include: LOBBY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: lobbies });
  } catch (error) {
    console.error("Lobby list error:", error);
    return NextResponse.json({ error: "Failed to list lobbies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { deckId, format, visibility } = await request.json() as {
      deckId: string;
      format?: string;
      visibility?: "PUBLIC" | "INVITE_ONLY";
    };

    if (!deckId) {
      return NextResponse.json({ error: "deckId is required" }, { status: 400 });
    }

    // Verify deck belongs to user
    const deck = await prisma.deck.findFirst({
      where: { id: deckId, userId },
    });
    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    // Close any existing WAITING lobby by this host
    await prisma.lobby.updateMany({
      where: { hostUserId: userId, status: "WAITING" },
      data: { status: "CLOSED" },
    });

    const lobby = await prisma.lobby.create({
      data: {
        hostUserId: userId,
        hostDeckId: deckId,
        format: format || "Standard",
        visibility: visibility || "PUBLIC",
      },
      include: LOBBY_INCLUDE,
    });

    return NextResponse.json(lobby, { status: 201 });
  } catch (error) {
    console.error("Lobby create error:", error);
    return NextResponse.json({ error: "Failed to create lobby" }, { status: 500 });
  }
}
