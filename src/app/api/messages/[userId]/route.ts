/**
 * GET  /api/messages/[userId] — Get message history with a user (paginated)
 * POST /api/messages/[userId] — Send a message
 */

import { after, NextRequest, NextResponse } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { SendMessageSchema } from "@/lib/validators/messages";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/realtime/fan-out";
import { serializeMessageForEvent } from "@/lib/realtime/serialize-message";

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
    // Polling mode: only fetch messages newer than `after` timestamp.
    // OPT-359: the implicit "GET marks read" side-effect that used to fire
    // here (and below) was removed; clients now call POST
    // /api/messages/[userId]/read explicitly.
    if (after) {
      // OPT-375: bound the client-supplied `after` window — a stale tab or a
      // deliberate after=1970 must not pull the whole conversation. Fetch one
      // extra row to detect overflow; `more: true` tells the client to poll
      // again from the last returned message. `afterId` makes the cursor a
      // composite (createdAt, id) so ties in createdAt at the page boundary
      // are neither skipped nor re-served forever; ordering must match it.
      const afterId = request.nextUrl.searchParams.get("afterId");
      const afterDate = new Date(after);
      const pollLimit = 200;
      const newMessages = await prisma.message.findMany({
        where: {
          AND: [
            {
              OR: [
                { fromUserId: myId, toUserId: otherId },
                { fromUserId: otherId, toUserId: myId },
              ],
            },
            afterId
              ? {
                  OR: [
                    { createdAt: { gt: afterDate } },
                    { createdAt: afterDate, id: { gt: afterId } },
                  ],
                }
              : { createdAt: { gt: afterDate } },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: pollLimit + 1,
        include: {
          fromUser: { select: { id: true, username: true, name: true, image: true } },
        },
      });

      const more = newMessages.length > pollLimit;
      return NextResponse.json({
        data: more ? newMessages.slice(0, pollLimit) : newMessages,
        more,
      });
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

    // `after` keeps the fanout alive past the response on Vercel Fluid Compute;
    // a bare `void notifyUser()` can be cancelled when the runtime terminates.
    after(() =>
      notifyUser(toUserId, {
        type: "message:new",
        message: serializeMessageForEvent(message),
      }),
    );

    return apiSuccess(message, 201);
  } catch (error) {
    console.error("Message send error:", error);
    return apiError("Failed to send message", 500);
  }
}
