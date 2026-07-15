/**
 * POST /api/realtime/users/[userId]/last-seen — Stamp `User.lastSeen`.
 *
 * Bearer-authed with `GAME_WORKER_SECRET`. Called by the `UserChannel` DO
 * after the 5s offline debounce fires, alongside the `presence:friend_offline`
 * fanout. The worker passes its own `lastSeen` ISO timestamp in the body so
 * the value persisted matches the value in the broadcast payload exactly —
 * generating a fresh `new Date()` here would drift by network round-trip.
 *
 * The DO has no direct DB access; this is the write path it proxies through.
 * Best-effort — the worker fires this without retrying.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";
const LastSeenBodySchema = z.object({ lastSeen: z.unknown().optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  if (!GAME_WORKER_SECRET) {
    return NextResponse.json(
      { error: "Realtime channel not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${GAME_WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  // Accept an optional `lastSeen` ISO string. If absent or invalid, fall
  // back to the server clock — older worker callers without the body still
  // produce a sensible (if slightly drifted) write.
  const body = LastSeenBodySchema.safeParse(
    await request.json().catch(() => null)
  );
  const lastSeen = parseLastSeen(body.success ? body.data.lastSeen : undefined);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeen },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // P2025 = record not found. Not an error condition for presence — a deleted
    // user shouldn't surface a 500 to the worker.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return new NextResponse(null, { status: 204 });
    }
    console.error("[realtime:update-last-seen] failed", error);
    return NextResponse.json(
      { error: "Failed to update last seen" },
      { status: 500 }
    );
  }
}

function parseLastSeen(raw: unknown): Date {
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
