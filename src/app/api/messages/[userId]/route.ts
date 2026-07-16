/**
 * GET  /api/messages/[userId] — Get message history with a user (paginated)
 * POST /api/messages/[userId] — Send a message
 */

import { after, NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import {
  MessageHistoryQuerySchema,
  SendMessageSchema,
} from "@/lib/validators/messages";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { socialLimiter } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/realtime/fan-out";
import { serializeMessageForEvent } from "@/lib/realtime/serialize-message";

const messageWithSender = {
  fromUser: {
    select: { id: true, username: true, name: true, image: true },
  },
} satisfies Prisma.MessageInclude;

function findMessageByIdempotencyKey(
  fromUserId: string,
  toUserId: string,
  idempotencyKey: string,
) {
  return prisma.message.findUnique({
    where: {
      fromUserId_toUserId_idempotencyKey: {
        fromUserId,
        toUserId,
        idempotencyKey,
      },
    },
    include: messageWithSender,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId: myId } = authResult;

  const { userId: otherId } = await params;
  const parsedQuery = MessageHistoryQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsedQuery.success) {
    return apiError("Invalid message history parameters", 400);
  }

  const { cursor, after: afterTimestamp, afterId } = parsedQuery.data;
  const limit = 50;

  try {
    // Polling mode: only fetch messages newer than `after` timestamp.
    // OPT-359: the implicit "GET marks read" side-effect that used to fire
    // here (and below) was removed; clients now call POST
    // /api/messages/[userId]/read explicitly.
    if (afterTimestamp) {
      // OPT-375: bound the client-supplied `after` window — a stale tab or a
      // deliberate after=1970 must not pull the whole conversation. Fetch one
      // extra row to detect overflow; `more: true` tells the client to poll
      // again from the last returned message. `afterId` makes the cursor a
      // composite (createdAt, id) so ties in createdAt at the page boundary
      // are neither skipped nor re-served forever; ordering must match it.
      const afterDate = new Date(afterTimestamp);
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
    console.error("[messages:list-history] failed", error);
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

  try {
    const parsed = await parseBody(request, SendMessageSchema);
    if (isErrorResponse(parsed)) return parsed;
    const { body, idempotencyKey: clientIdempotencyKey } = parsed;
    if (toUserId === fromUserId) {
      return apiError("Cannot message yourself", 400);
    }
    // Stale clients that predate idempotent sends remain compatible. Their
    // server-generated key is unique to this request, preserving the legacy
    // non-idempotent behavior while satisfying the database constraint.
    const idempotencyKey = clientIdempotencyKey ?? crypto.randomUUID();

    // A retry after an ambiguous client failure must succeed even if the
    // original request consumed the sender's rate-limit budget.
    const existingMessage = await findMessageByIdempotencyKey(
      fromUserId,
      toUserId,
      idempotencyKey,
    );
    if (existingMessage) {
      return apiSuccess(existingMessage, 200);
    }

    const { limited } = await socialLimiter.check(`msg:${fromUserId}`);
    if (limited) {
      return apiError("Too many requests. Try again later.", 429);
    }

    // Verify the target user exists
    const target = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!target) {
      return apiError("User not found", 404);
    }

    let message;
    try {
      message = await prisma.message.create({
        data: { fromUserId, toUserId, idempotencyKey, body },
        include: messageWithSender,
      });
    } catch (error) {
      // Two requests with the same key can both miss the lookup above. The
      // database unique index chooses the winner; the loser returns that row
      // without repeating recipient fanout.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrentMessage = await findMessageByIdempotencyKey(
          fromUserId,
          toUserId,
          idempotencyKey,
        );
        if (concurrentMessage) {
          return apiSuccess(concurrentMessage, 200);
        }
      }
      throw error;
    }

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
    console.error("[messages:send] failed", error);
    return apiError("Failed to send message", 500);
  }
}
