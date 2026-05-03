/**
 * POST /api/messages/[userId]/read — Mark messages from [userId] (the
 * conversation partner) up to a cutoff createdAt as read by the current
 * user. Replaces the implicit "GET marks read" side-effect from
 * `src/app/api/messages/[userId]/route.ts` (OPT-359).
 *
 * Side-effects:
 *   - Updates `Message.readAt` (and `Message.read` for backward-compat) on
 *     matching rows.
 *   - Fires `chat:read_to` to the original sender so their chat-widget can
 *     swap ✓ → ✓✓ on their own messages.
 *
 * Fanout is fire-and-forget via `after()` — same pattern as POST /messages.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { MarkMessagesReadSchema } from "@/lib/validators/messages";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/realtime/fan-out";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId: myId } = authResult;

  const { userId: otherUserId } = await params;
  if (otherUserId === myId) {
    return apiError("Cannot mark your own messages as read", 400);
  }

  const { limited } = await socialLimiter.check(`msg-read:${myId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const parsed = await parseBody(request, MarkMessagesReadSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { throughCreatedAt } = parsed;
  const cutoff = new Date(throughCreatedAt);

  try {
    const now = new Date();
    const result = await prisma.message.updateMany({
      // Only the recipient (myId) can mark messages from `otherUserId` to
      // themselves as read — naturally enforced by the where clause.
      where: {
        fromUserId: otherUserId,
        toUserId: myId,
        readAt: null,
        createdAt: { lte: cutoff },
      },
      // Keep `read` in sync so the conversations unread-count subquery
      // (`/api/messages/conversations`) continues to work.
      data: { readAt: now, read: true },
    });

    if (result.count > 0) {
      // Echo the **client cutoff**, not the server `now`. updateMany's
      // predicate is `createdAt <= cutoff`, so any message sent by the
      // original sender after the recipient computed the cutoff was *not*
      // marked read in the DB — broadcasting `now` would let the sender's
      // reducer over-ack those rows locally.
      const eventThroughCreatedAt = cutoff.toISOString();
      after(() =>
        notifyUser(otherUserId, {
          type: "chat:read_to",
          fromUserId: myId,
          throughCreatedAt: eventThroughCreatedAt,
        }),
      );
    }

    return apiSuccess({ updated: result.count });
  } catch (error) {
    console.error("Mark messages read error:", error);
    return apiError("Failed to mark messages as read", 500);
  }
}
