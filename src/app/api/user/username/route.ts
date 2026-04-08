/**
 * POST /api/user/username — Set username for authenticated user (onboarding)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SetUsernameSchema } from "@/lib/validators/user";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { limited } = await apiLimiter.check(`username:${session.user.id}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const parsed = await parseBody(request, SetUsernameSchema);
    if (isErrorResponse(parsed)) return parsed;
    const trimmed = parsed.username;

    // Check uniqueness
    const existing = await prisma.user.findUnique({
      where: { username: trimmed },
    });

    if (existing && existing.id !== session.user.id) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { username: trimmed },
    });

    return NextResponse.json({ data: { username: user.username } });
  } catch (error) {
    console.error("Username update error:", error);
    return NextResponse.json(
      { error: "Failed to set username" },
      { status: 500 }
    );
  }
}
