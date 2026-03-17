/**
 * POST /api/user/username — Set username for authenticated user (onboarding)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { username } = body;

    // Validate
    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    const trimmed = username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      return NextResponse.json(
        { error: "Username must be 3–20 characters" },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return NextResponse.json(
        {
          error:
            "Username can only contain letters, numbers, hyphens, and underscores",
        },
        { status: 400 }
      );
    }

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

    return NextResponse.json({ username: user.username });
  } catch (error) {
    console.error("Username update error:", error);
    return NextResponse.json(
      { error: "Failed to set username" },
      { status: 500 }
    );
  }
}
