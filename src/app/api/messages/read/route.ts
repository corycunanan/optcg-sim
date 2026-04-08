/**
 * PUT /api/messages/read?messageId=... — Mark a message as read
 */

import { NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { socialLimiter } from "@/lib/rate-limit";

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await socialLimiter.check(`msg-read:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const messageId = request.nextUrl.searchParams.get("messageId");

  if (!messageId) {
    return apiError("messageId required", 400);
  }

  try {
    const msg = await prisma.message.findFirst({
      where: { id: messageId, toUserId: userId },
    });

    if (!msg) {
      return apiError("Message not found", 404);
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { read: true },
    });

    return apiAction();
  } catch (error) {
    console.error("Mark read error:", error);
    return apiError("Failed to mark message as read", 500);
  }
}
