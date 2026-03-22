/**
 * POST /api/lobbies — Create a lobby with a join code.
 * Returns { lobbyId, joinCode } for the host to share.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateLobbyCode } from "@/lib/lobbies";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { deckId, format } = (await request.json()) as {
      deckId: string;
      format?: string;
    };

    if (!deckId) {
      return NextResponse.json({ error: "deckId is required" }, { status: 400 });
    }

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

    let lobby = null;
    let attempts = 0;
    while (!lobby && attempts < 5) {
      attempts += 1;
      try {
        lobby = await prisma.lobby.create({
          data: {
            hostUserId: userId,
            hostDeckId: deckId,
            format: format || "Standard",
            joinCode: generateLobbyCode(),
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!lobby) {
      return NextResponse.json(
        { error: "Failed to generate unique lobby code" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { lobbyId: lobby.id, joinCode: lobby.joinCode },
      { status: 201 },
    );
  } catch (error) {
    console.error("Lobby create error:", error);
    return NextResponse.json({ error: "Failed to create lobby" }, { status: 500 });
  }
}
