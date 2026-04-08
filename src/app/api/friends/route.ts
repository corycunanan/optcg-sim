/**
 * GET /api/friends — List current user's friends
 */

import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

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

    return apiSuccess(friends, 200, { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" });
  } catch (error) {
    console.error("Friends list error:", error);
    return apiError("Failed to list friends", 500);
  }
}
