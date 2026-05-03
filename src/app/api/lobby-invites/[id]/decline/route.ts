/**
 * POST /api/lobby-invites/[id]/decline — Recipient declines a lobby invite.
 *
 * Marks the row DECLINED and fans out `lobby:invite_declined` to both the
 * host (so any "Invited X" pending state can clear) and the recipient
 * themselves (so a duplicate toast in another tab auto-dismisses).
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/realtime/fan-out";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-invite-decline:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id: inviteId } = await params;

  const invite = await prisma.lobbyInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      toUserId: true,
      fromUserId: true,
      status: true,
    },
  });

  if (!invite) {
    return apiError("Invite not found", 404);
  }

  if (invite.toUserId !== userId) {
    return apiError("Forbidden", 403);
  }

  if (invite.status !== "PENDING") {
    return apiError("Invite is no longer active", 410);
  }

  await prisma.lobbyInvite.update({
    where: { id: inviteId },
    data: { status: "DECLINED" },
  });

  after(async () => {
    await Promise.all([
      notifyUser(invite.fromUserId, {
        type: "lobby:invite_declined",
        inviteId: invite.id,
      }),
      // Echo to the recipient so a duplicate toast in another tab clears.
      notifyUser(invite.toUserId, {
        type: "lobby:invite_declined",
        inviteId: invite.id,
      }),
    ]);
  });

  return apiAction();
}
