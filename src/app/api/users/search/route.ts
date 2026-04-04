/**
 * GET /api/users/search?q=username
 * Search users by username (partial match, case-insensitive).
 * Returns up to 10 results, excluding the current user.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { searchLimiter } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limited } = searchLimiter.check(`user-search:${session.user.id}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: "insensitive" },
        id: { not: session.user.id },
      },
      select: { id: true, username: true, name: true, image: true },
      take: 10,
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error("User search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
