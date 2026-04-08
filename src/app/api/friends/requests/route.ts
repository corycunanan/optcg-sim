/**
 * GET  /api/friends/requests — List pending incoming/outgoing requests
 * POST /api/friends/requests — Send a friend request
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { SendFriendRequestSchema } from "@/lib/validators/friends";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

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

    return apiSuccess({ incoming, outgoing }, 200, { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" });
  } catch (error) {
    console.error("Friend requests list error:", error);
    return apiError("Failed to list requests", 500);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await socialLimiter.check(`friend-req:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, SendFriendRequestSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { toUserId } = parsed;
    if (toUserId === userId) {
      return apiError("Cannot send request to yourself", 400);
    }

    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) {
      return apiError("User not found", 404);
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: toUserId },
          { userAId: toUserId, userBId: userId },
        ],
      },
    });
    if (friendship) {
      return apiError("Already friends", 409);
    }

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
      return apiError("Request already pending", 409);
    }

    const req = await prisma.friendRequest.create({
      data: { fromUserId: userId, toUserId },
      include: {
        toUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    return apiSuccess(req, 201);
  } catch (error) {
    console.error("Friend request create error:", error);
    return apiError("Failed to send request", 500);
  }
}
