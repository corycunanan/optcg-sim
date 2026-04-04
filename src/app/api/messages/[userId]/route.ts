/**
 * GET  /api/messages/[userId] — Get message history with a user (paginated)
 * POST /api/messages/[userId] — Send a message
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SendMessageSchema } from "@/lib/validators/messages";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const myId = session.user.id;
  const { userId: otherId } = await params;
  const cursor = request.nextUrl.searchParams.get("cursor");
  const after = request.nextUrl.searchParams.get("after");
  const limit = 50;

  try {
    // Polling mode: only fetch messages newer than `after` timestamp
    if (after) {
      const newMessages = await prisma.message.findMany({
        where: {
          OR: [
            { fromUserId: myId, toUserId: otherId },
            { fromUserId: otherId, toUserId: myId },
          ],
          createdAt: { gt: new Date(after) },
        },
        orderBy: { createdAt: "asc" },
        include: {
          fromUser: { select: { id: true, username: true, name: true, image: true } },
        },
      });

      if (newMessages.length > 0) {
        await prisma.message.updateMany({
          where: { fromUserId: otherId, toUserId: myId, read: false },
          data: { read: true },
        });
      }

      return NextResponse.json({ data: newMessages });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { fromUserId: myId, toUserId: otherId },
          { fromUserId: otherId, toUserId: myId },
        ],
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        fromUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    // Mark incoming messages as read
    await prisma.message.updateMany({
      where: { fromUserId: otherId, toUserId: myId, read: false },
      data: { read: true },
    });

    return NextResponse.json({
      data: messages.reverse(), // oldest first
      nextCursor: messages.length === limit ? messages[0].createdAt.toISOString() : null,
    });
  } catch (error) {
    console.error("Message history error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fromUserId = session.user.id;
  const { userId: toUserId } = await params;

  const { limited } = socialLimiter.check(`msg:${fromUserId}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const parsed = await parseBody(request, SendMessageSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { body } = parsed;
    if (toUserId === fromUserId) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    // Verify the target user exists
    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const message = await prisma.message.create({
      data: { fromUserId, toUserId, body: body.trim() },
      include: {
        fromUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error) {
    console.error("Message send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
