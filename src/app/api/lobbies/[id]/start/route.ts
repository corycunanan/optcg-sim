/**
 * POST /api/lobbies/[id]/start — Host starts the game (both players must be ready)
 * In M2 this is a stub — actual game initialization is M3.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const lobby = await prisma.lobby.findFirst({
      where: { id, hostUserId: userId },
      include: { guest: true },
    });

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }
    if (lobby.status !== "READY") {
      return NextResponse.json({ error: "Lobby is not ready (needs a guest)" }, { status: 409 });
    }

    await prisma.lobby.update({
      where: { id },
      data: { status: "IN_GAME" },
    });

    // M3: create game record here and return gameId
    return NextResponse.json({ started: true, gameId: null });
  } catch (error) {
    console.error("Lobby start error:", error);
    return NextResponse.json({ error: "Failed to start game" }, { status: 500 });
  }
}
