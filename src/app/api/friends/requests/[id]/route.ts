/**
 * PUT /api/friends/requests/[id] — Accept or decline a friend request
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { FriendRequestActionSchema } from "@/lib/validators/friends";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const parsed = await parseBody(request, FriendRequestActionSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { action } = parsed;

    const req = await prisma.friendRequest.findFirst({
      where: { id, toUserId: userId, status: "PENDING" },
    });

    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (action === "accept") {
      // Create friendship with userA < userB lexicographically
      const [userAId, userBId] = [req.fromUserId, userId].sort();

      await prisma.$transaction([
        prisma.friendship.create({ data: { userAId, userBId } }),
        prisma.friendRequest.delete({ where: { id } }),
      ]);

      return NextResponse.json({ success: true });
    } else {
      // Decline — delete the request
      await prisma.friendRequest.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Friend request action error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
