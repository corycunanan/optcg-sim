/**
 * GET    /api/lobbies/[id] — Get lobby details
 * DELETE /api/lobbies/[id] — Host closes lobby
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
    const lobby = await prisma.lobby.findUnique({
      where: { id },
      include: LOBBY_INCLUDE,
    });

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }

    return NextResponse.json(lobby);
  } catch (error) {
    console.error("Lobby fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch lobby" }, { status: 500 });
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

  const userId = session.user.id;
  const { id } = await params;

  try {
    const lobby = await prisma.lobby.findFirst({
      where: { id, hostUserId: userId },
    });

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }

    await prisma.lobby.update({
      where: { id },
      data: { status: "CLOSED" },
    });

    return NextResponse.json({ closed: true });
  } catch (error) {
    console.error("Lobby close error:", error);
    return NextResponse.json({ error: "Failed to close lobby" }, { status: 500 });
  }
}
