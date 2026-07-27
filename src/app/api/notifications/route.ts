/**
 * GET /api/notifications — List the authenticated user's notification inbox.
 * PUT /api/notifications — Bulk notification actions.
 */

import { after, NextRequest } from "next/server";
import {
  apiAction,
  apiError,
  apiSuccess,
  requireAuth,
} from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter, searchLimiter } from "@/lib/rate-limit";
import {
  ListNotificationsQuerySchema,
  NotificationBulkActionSchema,
} from "@/lib/validators/notifications";
import { isErrorResponse, parseBody } from "@/lib/validators/helpers";
import { publishNotificationsReadAll } from "@/lib/realtime/publish-notification";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await searchLimiter.check(`notifications:list:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const parsedQuery = ListNotificationsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsedQuery.success) {
    return apiError("Invalid pagination parameters", 400);
  }

  const { page, limit } = parsedQuery.data;

  try {
    const { notifications, total, unreadCount } = await prisma.$transaction(
      async (tx) => {
        const [rows, rowCount, pendingCount] = await Promise.all([
          tx.notification.findMany({
            where: { userId },
            include: {
              actor: {
                select: { id: true, username: true, name: true, image: true },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.notification.count({ where: { userId } }),
          tx.notification.count({ where: { userId, status: "PENDING" } }),
        ]);

        return {
          notifications: rows,
          total: rowCount,
          unreadCount: pendingCount,
        };
      },
      {
        // PostgreSQL's default READ COMMITTED takes a new snapshot per
        // statement. REPEATABLE READ keeps rows and both counts coherent.
        isolationLevel: "RepeatableRead",
      }
    );

    return apiSuccess(
      {
        notifications,
        unreadCount,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      200,
      { "Cache-Control": "private, no-store" }
    );
  } catch (error) {
    console.error("[notifications:list] failed", error);
    return apiError("Failed to list notifications", 500);
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`notifications:bulk:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  try {
    const parsed = await parseBody(request, NotificationBulkActionSchema);
    if (isErrorResponse(parsed)) return parsed;

    const result = await prisma.notification.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "READ" },
    });

    if (result.count > 0) {
      after(() => publishNotificationsReadAll(userId));
    }

    return apiAction();
  } catch (error) {
    console.error("[notifications:bulk-update] failed", error);
    return apiError("Failed to update notifications", 500);
  }
}
