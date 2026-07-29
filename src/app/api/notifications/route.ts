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
import { ACTIONABLE_NOTIFICATION_WHERE } from "@/lib/notification-order";
import { apiLimiter, searchLimiter } from "@/lib/rate-limit";
import {
  ListNotificationsQuerySchema,
  NotificationBulkActionSchema,
} from "@/lib/validators/notifications";
import { isErrorResponse, parseBody } from "@/lib/validators/helpers";
import { publishNotificationsReadAll } from "@/lib/realtime/publish-notification";
import { pruneNotifications } from "@/lib/notifications";

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
    const { notifications, total, unreadCount, totalPages } =
      await prisma.$transaction(
        async (tx) => {
          const [rowCount, pendingCount, actionableCount] = await Promise.all([
            tx.notification.count({ where: { userId } }),
            tx.notification.count({ where: { userId, status: "PENDING" } }),
            tx.notification.count({
              where: { userId, ...ACTIONABLE_NOTIFICATION_WHERE },
            }),
          ]);

          const firstPageSize = Math.max(limit, actionableCount);
          const nonActionableFirstPageSize = Math.max(
            0,
            limit - actionableCount
          );
          const include = {
            actor: {
              select: { id: true, username: true, name: true, image: true },
            },
          } as const;
          const orderBy = [
            { createdAt: "desc" as const },
            { id: "desc" as const },
          ];
          const actionableWhere = {
            userId,
            ...ACTIONABLE_NOTIFICATION_WHERE,
          };
          const nonActionableWhere = {
            userId,
            NOT: ACTIONABLE_NOTIFICATION_WHERE,
          };

          let notifications;
          if (page === 1) {
            const [actionableRows, nonActionableRows] = await Promise.all([
              tx.notification.findMany({
                where: actionableWhere,
                include,
                orderBy,
                take: firstPageSize,
              }),
              nonActionableFirstPageSize > 0
                ? tx.notification.findMany({
                    where: nonActionableWhere,
                    include,
                    orderBy,
                    take: nonActionableFirstPageSize,
                  })
                : Promise.resolve([]),
            ]);
            notifications = [...actionableRows, ...nonActionableRows];
          } else {
            notifications = await tx.notification.findMany({
              where: nonActionableWhere,
              include,
              orderBy,
              skip: nonActionableFirstPageSize + (page - 2) * limit,
              take: limit,
            });
          }

          return {
            notifications,
            total: rowCount,
            unreadCount: pendingCount,
            totalPages:
              rowCount === 0
                ? 0
                : 1 + Math.ceil(Math.max(0, rowCount - firstPageSize) / limit),
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
          totalPages,
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
    // Additive only: OPT-594 owns the GET list query and ordering.
    after(() => pruneNotifications(userId));

    return apiAction();
  } catch (error) {
    console.error("[notifications:bulk-update] failed", error);
    return apiError("Failed to update notifications", 500);
  }
}
