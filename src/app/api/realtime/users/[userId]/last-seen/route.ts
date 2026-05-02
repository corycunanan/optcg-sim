/**
 * POST /api/realtime/users/[userId]/last-seen — Stamp `User.lastSeen = now()`.
 *
 * Bearer-authed with `GAME_WORKER_SECRET`. Called by the `UserChannel` DO
 * after the 5s offline debounce fires, alongside the `presence:friend_offline`
 * fanout. The DO has no direct DB access; this is the write path it proxies
 * through. Best-effort — the worker fires this without retrying.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!GAME_WORKER_SECRET) {
    return NextResponse.json({ error: "Realtime channel not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${GAME_WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // P2025 = record not found. Not an error condition for presence — a deleted
    // user shouldn't surface a 500 to the worker.
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return new NextResponse(null, { status: 204 });
    }
    console.error("last-seen update error:", error);
    return NextResponse.json({ error: "Failed to update last seen" }, { status: 500 });
  }
}
