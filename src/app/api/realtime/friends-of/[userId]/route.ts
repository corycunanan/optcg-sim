/**
 * GET /api/realtime/friends-of/[userId] — Friend list for the UserChannel DO.
 *
 * Bearer-authed with `GAME_WORKER_SECRET` (same shared secret the worker uses
 * to authenticate inbound notifies). The `UserChannel` Durable Object calls
 * this when a user transitions 0 → 1 sockets (online) or after a 5s debounce
 * at last detach (offline) so it knows whose sidebar to fan a presence event
 * out to. The DO caches the response for 60s to bound friend-add/remove churn.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function GET(
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
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });

    const friendIds = friendships.map((f) =>
      f.userAId === userId ? f.userBId : f.userAId,
    );

    return NextResponse.json({ data: { friendIds } });
  } catch (error) {
    console.error("[realtime:list-friends-of] failed", error);
    return NextResponse.json({ error: "Failed to load friends" }, { status: 500 });
  }
}
