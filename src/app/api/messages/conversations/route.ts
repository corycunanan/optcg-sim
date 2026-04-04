/**
 * GET /api/messages/conversations
 * Returns the user's conversations: one entry per other user they've messaged,
 * with the last message and unread count.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // Get all messages involving this user, pick the most recent per conversation
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, username: true, name: true, image: true } },
        toUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    // Batch unread counts in a single query instead of N+1 per-conversation counts
    const unreadCounts = await prisma.message.groupBy({
      by: ["fromUserId"],
      where: { toUserId: userId, read: false },
      _count: true,
    });
    const unreadMap = new Map(
      unreadCounts.map((row) => [row.fromUserId, row._count]),
    );

    // Group into conversations keyed by the other user's ID
    const seen = new Set<string>();
    const conversations: {
      user: { id: string; username: string | null; name: string | null; image: string | null };
      lastMessage: { body: string; createdAt: Date; fromUserId: string };
      unreadCount: number;
    }[] = [];

    for (const msg of messages) {
      const otherId = msg.fromUserId === userId ? msg.toUserId : msg.fromUserId;
      if (seen.has(otherId)) continue;
      seen.add(otherId);

      const otherUser = msg.fromUserId === userId ? msg.toUser : msg.fromUser;

      conversations.push({
        user: otherUser,
        lastMessage: { body: msg.body, createdAt: msg.createdAt, fromUserId: msg.fromUserId },
        unreadCount: unreadMap.get(otherId) ?? 0,
      });
    }

    return NextResponse.json({ data: conversations });
  } catch (error) {
    console.error("Conversations list error:", error);
    return NextResponse.json({ error: "Failed to list conversations" }, { status: 500 });
  }
}
