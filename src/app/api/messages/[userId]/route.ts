/**
 * GET  /api/messages/[userId] — Get message history with a user (paginated)
 * POST /api/messages/[userId] — Send a message
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { SendMessageSchema } from "@/lib/validators/messages";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId: myId } = authResult;

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

      return apiSuccess(newMessages);
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

    const reversed = messages.reverse(); // oldest first
    return apiSuccess(reversed, 200, undefined);
  } catch (error) {
    console.error("Message history error:", error);
    return apiError("Failed to fetch messages", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId: fromUserId } = authResult;

  const { userId: toUserId } = await params;

  const { limited } = await socialLimiter.check(`msg:${fromUserId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, SendMessageSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { body } = parsed;
    if (toUserId === fromUserId) {
      return apiError("Cannot message yourself", 400);
    }

    // Verify the target user exists
    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) {
      return apiError("User not found", 404);
    }

    const message = await prisma.message.create({
      data: { fromUserId, toUserId, body: body.trim() },
      include: {
        fromUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    return apiSuccess(message, 201);
  } catch (error) {
    console.error("Message send error:", error);
    return apiError("Failed to send message", 500);
  }
}
