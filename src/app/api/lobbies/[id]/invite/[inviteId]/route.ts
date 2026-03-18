/**
 * PUT /api/lobbies/[id]/invite/[inviteId] — Accept or decline a lobby invite
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id, inviteId } = await params;

  try {
    const { action } = await request.json() as { action: "accept" | "decline" };

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
    }

    const invite = await prisma.lobbyInvite.findFirst({
      where: { id: inviteId, lobbyId: id, userId, status: "PENDING" },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    await prisma.lobbyInvite.update({
      where: { id: inviteId },
      data: { status: action === "accept" ? "ACCEPTED" : "DECLINED" },
    });

    return NextResponse.json({ [action === "accept" ? "accepted" : "declined"]: true });
  } catch (error) {
    console.error("Lobby invite action error:", error);
    return NextResponse.json({ error: "Failed to process invite" }, { status: 500 });
  }
}
