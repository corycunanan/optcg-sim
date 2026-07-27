/**
 * PUT /api/notifications/[id] — Read, dismiss, or act on a notification.
 */

import { NextRequest } from "next/server";
import { PUT as resolveFriendRequest } from "@/app/api/friends/requests/[id]/route";
import { apiAction, apiError, requireAuth } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { isErrorResponse, parseBody } from "@/lib/validators/helpers";
import { NotificationActionSchema } from "@/lib/validators/notifications";
import { NOTIFICATION_ACTION_RATE_LIMIT_CHARGED } from "@/lib/friend-request-rate-limit";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  // Single-charge invariant: every authenticated path is charged here exactly
  // once. Proxied friend actions carry an unforgeable marker so the inner route
  // does not also charge socialLimiter.
  const { limited } = await apiLimiter.check(`notifications:action:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  try {
    const parsed = await parseBody(request, NotificationActionSchema);
    if (isErrorResponse(parsed)) return parsed;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
      select: { type: true, status: true, referenceId: true },
    });
    if (!notification) {
      return apiError("Notification not found", 404);
    }

    if (parsed.action === "read" || parsed.action === "dismiss") {
      await prisma.notification.updateMany({
        where: {
          id,
          userId,
          status: { in: ["PENDING", "READ"] },
        },
        data: { status: parsed.action === "read" ? "READ" : "DISMISSED" },
      });
      return apiAction();
    }

    const resolvedStatus = parsed.action === "accept" ? "ACCEPTED" : "DECLINED";
    if (notification.status === resolvedStatus) {
      return apiAction();
    }
    if (
      notification.status === "ACCEPTED" ||
      notification.status === "DECLINED"
    ) {
      return apiError(`Notification already ${notification.status.toLowerCase()}`, 409);
    }
    if (notification.type !== "FRIEND_REQUEST" || !notification.referenceId) {
      return apiError("Notification action unavailable", 422);
    }

    const friendRequest = new NextRequest(
      new URL(
        `/api/friends/requests/${notification.referenceId}`,
        request.nextUrl,
      ),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: parsed.action }),
      },
    );
    const response = await resolveFriendRequest(friendRequest, {
      params: Promise.resolve({ id: notification.referenceId }),
      rateLimitCharge: NOTIFICATION_ACTION_RATE_LIMIT_CHARGED,
    });

    if (response.status !== 404) return response;

    // A legacy surface may have resolved the request between our notification
    // read and the proxy call. Reconcile that race idempotently from the
    // notification row updated by the friend-request transaction.
    const latest = await prisma.notification.findFirst({
      where: { id, userId },
      select: { status: true },
    });
    if (latest?.status === resolvedStatus) {
      return apiAction();
    }

    return response;
  } catch (error) {
    console.error("[notifications:update] failed", error);
    return apiError("Failed to update notification", 500);
  }
}
