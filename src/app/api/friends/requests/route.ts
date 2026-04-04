/**
 * GET  /api/friends/requests — List pending incoming/outgoing requests
 * POST /api/friends/requests — Send a friend request
 */

import { NextRequest, NextResponse } from "next/server";
import { SendFriendRequestSchema } from "@/lib/validators/friends";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [incoming, outgoing] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { toUserId: userId, status: "PENDING" },
        include: {
          fromUser: { select: { id: true, username: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.friendRequest.findMany({
        where: { fromUserId: userId, status: "PENDING" },
        include: {
          toUser: { select: { id: true, username: true, name: true, image: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ data: { incoming, outgoing } }, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Friend requests list error:", error);
    return NextResponse.json({ error: "Failed to list requests" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const parsed = await parseBody(request, SendFriendRequestSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { toUserId } = parsed;
    if (toUserId === userId) {
      return NextResponse.json({ error: "Cannot send request to yourself" }, { status: 400 });
    }

    // Check if target user exists
    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if already friends (either direction)
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: toUserId },
          { userAId: toUserId, userBId: userId },
        ],
      },
    });
    if (friendship) {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }

    // Check for existing pending request (either direction)
    const existing = await prisma.friendRequest.findFirst({
      where: {
        status: "PENDING",
        OR: [
          { fromUserId: userId, toUserId },
          { fromUserId: toUserId, toUserId: userId },
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ error: "Request already pending" }, { status: 409 });
    }

    const req = await prisma.friendRequest.create({
      data: { fromUserId: userId, toUserId },
      include: {
        toUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    return NextResponse.json({ data: req }, { status: 201 });
  } catch (error) {
    console.error("Friend request create error:", error);
    return NextResponse.json({ error: "Failed to send request" }, { status: 500 });
  }
}
