/**
 * POST /api/user/username — Set username for authenticated user (onboarding)
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { SetUsernameSchema } from "@/lib/validators/user";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`username:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, SetUsernameSchema);
    if (isErrorResponse(parsed)) return parsed;
    const trimmed = parsed.username;

    // Check uniqueness
    const existing = await prisma.user.findUnique({
      where: { username: trimmed },
    });

    if (existing && existing.id !== userId) {
      return apiError("Username is already taken", 409);
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username: trimmed },
    });

    return apiSuccess({ username: user.username });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError("Username is already taken", 409);
    }
    console.error("Username update error:", error);
    return apiError("Failed to set username", 500);
  }
}
