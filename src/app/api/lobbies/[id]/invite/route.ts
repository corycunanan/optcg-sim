/**
 * POST /api/lobbies/[id]/invite — Invite a friend to the lobby
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
    const { inviteeId } = await request.json() as { inviteeId: string };

    if (!inviteeId) {
      return NextResponse.json({ error: "inviteeId is required" }, { status: 400 });
    }

    const lobby = await prisma.lobby.findFirst({
      where: { id, hostUserId: userId, status: { in: ["WAITING", "READY"] } },
    });

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found or not yours" }, { status: 404 });
    }

    // Upsert invite (idempotent)
    const invite = await prisma.lobbyInvite.upsert({
      where: { lobbyId_userId: { lobbyId: id, userId: inviteeId } },
      update: { status: "PENDING" },
      create: { lobbyId: id, userId: inviteeId },
    });

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    console.error("Lobby invite error:", error);
    return NextResponse.json({ error: "Failed to send invite" }, { status: 500 });
  }
}
