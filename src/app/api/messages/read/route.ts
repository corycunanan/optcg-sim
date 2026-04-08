/**
 * PUT /api/messages/read?messageId=... — Mark a message as read
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { socialLimiter } from "@/lib/rate-limit";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const { limited } = await socialLimiter.check(`msg-read:${userId}`);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const messageId = request.nextUrl.searchParams.get("messageId");

  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  try {
    const msg = await prisma.message.findFirst({
      where: { id: messageId, toUserId: userId },
    });

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    return NextResponse.json({ error: "Failed to mark message as read" }, { status: 500 });
  }
}
