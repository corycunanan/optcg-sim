/**
 * PUT /api/friends/requests/[id] — Accept or decline a friend request
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { FriendRequestActionSchema } from "@/lib/validators/friends";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/realtime/fan-out";
import {
  serializeFriendRequestForEvent,
  serializeFriendshipForEvent,
} from "@/lib/realtime/serialize-friend";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { session, userId } = authResult;

  const { limited } = await socialLimiter.check(`friend-action:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const parsed = await parseBody(request, FriendRequestActionSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { action } = parsed;

    const req = await prisma.friendRequest.findFirst({
      where: { id, toUserId: userId, status: "PENDING" },
      include: {
        fromUser: { select: { id: true, username: true, name: true, image: true } },
      },
    });

    if (!req) {
      return apiError("Request not found", 404);
    }

    if (action === "accept") {
      // Create friendship with userA < userB lexicographically
      const [userAId, userBId] = [req.fromUserId, userId].sort();

      const [friendship] = await prisma.$transaction([
        prisma.friendship.create({ data: { userAId, userBId } }),
        prisma.friendRequest.delete({ where: { id } }),
      ]);

      // The accepter's user info, sent to the original sender so their
      // sidebar can append the new friend without a refetch.
      const accepter = {
        id: userId,
        username: session.user.username ?? null,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      };

      after(() =>
        notifyUser(req.fromUserId, {
          type: "friend:request_accepted",
          request: serializeFriendRequestForEvent(req),
          friendship: serializeFriendshipForEvent(friendship, accepter),
        }),
      );

      return apiAction();
    } else {
      // Decline — delete the request
      await prisma.friendRequest.delete({ where: { id } });

      after(() =>
        notifyUser(req.fromUserId, {
          type: "friend:request_declined",
          requestId: id,
        }),
      );

      return apiAction();
    }
  } catch (error) {
    console.error("Friend request action error:", error);
    return apiError("Failed to process request", 500);
  }
}
