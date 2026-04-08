/**
 * GET /api/users/search?q=username
 * Search users by username (partial match, case-insensitive).
 * Returns up to 10 results, excluding the current user.
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { searchLimiter } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await searchLimiter.check(`user-search:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) {
    return apiSuccess([]);
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: "insensitive" },
        id: { not: userId },
      },
      select: { id: true, username: true, name: true, image: true },
      take: 10,
    });

    return apiSuccess(users);
  } catch (error) {
    console.error("User search error:", error);
    return apiError("Search failed", 500);
  }
}
