/**
 * GET /api/lobbies/status — Returns the current user's lobby context:
 *   - pending invites (someone invited you to their lobby)
 *   - your own active WAITING lobby (if you created one)
 *   - open public lobbies (excluding your own)
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [invites, myLobby, openLobbies] = await Promise.all([
      // Pending invites to lobbies you've been invited to
      prisma.lobbyInvite.findMany({
        where: { userId, status: "PENDING" },
        include: {
          lobby: {
            include: {
              host: { select: { id: true, username: true, name: true, image: true } },
              hostDeck: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      // Your own current waiting lobby
      prisma.lobby.findFirst({
        where: { hostUserId: userId, status: "WAITING" },
        include: {
          hostDeck: { select: { id: true, name: true } },
          guest: {
            include: {
              user: { select: { id: true, username: true, name: true, image: true } },
            },
          },
        },
      }),

      // Open public lobbies (not yours)
      prisma.lobby.findMany({
        where: {
          status: "WAITING",
          visibility: "PUBLIC",
          hostUserId: { not: userId },
        },
        include: {
          host: { select: { id: true, username: true, name: true, image: true } },
          hostDeck: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({ invites, myLobby, openLobbies }, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Lobby status error:", error);
    return NextResponse.json({ error: "Failed to fetch lobby status" }, { status: 500 });
  }
}
