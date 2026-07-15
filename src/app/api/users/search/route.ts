/**
 * GET /api/users/search?q=username
 * Search users by username (partial match, case-insensitive).
 * Returns up to 10 results, excluding the current user.
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { searchLimiter } from "@/lib/rate-limit";
import {
  isSubstringSearchQueryTooShort,
  normalizeSubstringSearchQuery,
} from "@/lib/search-query";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await searchLimiter.check(`user-search:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const q = normalizeSubstringSearchQuery(
    request.nextUrl.searchParams.get("q"),
  );
  if (!q) {
    return apiSuccess([]);
  }
  if (isSubstringSearchQueryTooShort(q)) {
    return apiError("Search query must be at least 3 characters", 400, {
      code: "SEARCH_QUERY_TOO_SHORT",
    });
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
