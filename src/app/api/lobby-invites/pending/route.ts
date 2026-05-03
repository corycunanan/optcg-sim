/**
 * GET /api/lobby-invites/pending — Reconciliation endpoint.
 *
 * Surfaces any PENDING invites for the caller that haven't yet expired.
 * Called from the app shell on mount so toasts appear for recipients who
 * were offline when the original `lobby:invite_received` push fired.
 *
 * Same wire shape as the push event payload (`SerializedLobbyInvite`) so
 * the recipient component can dedupe by id.
 */

import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { searchLimiter } from "@/lib/rate-limit";
import { serializeLobbyInviteForEvent } from "@/lib/realtime/serialize-lobby-invite";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await searchLimiter.check(`lobby-invite-pending:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const now = new Date();
  const invites = await prisma.lobbyInvite.findMany({
    where: {
      toUserId: userId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    include: {
      fromUser: {
        select: { id: true, username: true, name: true, image: true },
      },
      lobby: {
        select: {
          joinCode: true,
          format: true,
          mode: true,
          status: true,
          host: { select: { username: true } },
        },
      },
    },
  });

  // Skip rows whose lobby moved past WAITING/READY before the recipient
  // could fetch — they would no-op on accept anyway.
  const visible = invites.filter(
    (i) => i.lobby.status === "WAITING" || i.lobby.status === "READY",
  );

  return apiSuccess(visible.map(serializeLobbyInviteForEvent));
}
