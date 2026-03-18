/**
 * DELETE /api/friends/[userId] — Remove a friend
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { userId: friendId } = await params;

  try {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: friendId },
          { userAId: friendId, userBId: userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Remove friend error:", error);
    return NextResponse.json({ error: "Failed to remove friend" }, { status: 500 });
  }
}
