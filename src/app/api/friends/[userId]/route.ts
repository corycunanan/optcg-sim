/**
 * DELETE /api/friends/[userId] — Remove a friend
 */

import { NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { socialLimiter } from "@/lib/rate-limit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await socialLimiter.check(`unfriend:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

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
      return apiError("Friendship not found", 404);
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });

    return apiAction();
  } catch (error) {
    console.error("Remove friend error:", error);
    return apiError("Failed to remove friend", 500);
  }
}
