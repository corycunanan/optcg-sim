/**
 * GET /api/game/active — Returns the current user's active game session, if any.
 * Used to show a "Rejoin" button when a player navigates away from an ongoing game.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ game: null });
  }

  const userId = session.user.id;

  const game = await prisma.gameSession.findFirst({
    where: {
      status: "IN_PROGRESS",
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ game: game ?? null }, {
    headers: { "Cache-Control": "no-store" },
  });
}
