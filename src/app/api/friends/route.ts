/**
 * GET /api/friends — List current user's friends
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
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: { id: true, username: true, name: true, image: true } },
        userB: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    // Normalize: return the *other* user in each friendship
    const friends = friendships.map((f) => {
      const friend = f.userAId === userId ? f.userB : f.userA;
      return { friendshipId: f.id, user: friend, since: f.createdAt };
    });

    return NextResponse.json({ data: friends }, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Friends list error:", error);
    return NextResponse.json({ error: "Failed to list friends" }, { status: 500 });
  }
}
