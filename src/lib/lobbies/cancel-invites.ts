/**
 * Mark all PENDING invites for a lobby as CANCELED and emit
 * `lobby:invite_canceled` to each recipient.
 *
 * Called from two sites:
 *   1. Host closes the lobby (`DELETE /api/lobbies/[id]`).
 *   2. Host starts the game (`POST /api/lobbies/[id]/start`).
 *
 * `READY → IN_GAME` and the soft-CLOSED transition both leave the lobby row
 * intact, so the `onDelete: Cascade` on `LobbyInvite.lobby` doesn't fire —
 * we explicitly cancel + fan out instead.
 *
 * Best-effort: caller schedules this in `after()`. A failed update or
 * notify gets logged but never propagates back to the originating
 * mutation's response.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notifyUser } from "@/lib/realtime/fan-out";

export interface CanceledLobbyInvite {
  id: string;
  toUserId: string;
}

/**
 * Cancel pending invites as part of a caller-owned transaction.
 *
 * Returning only rows that actually transitioned lets the caller defer
 * realtime delivery until after commit without publishing phantom cancels.
 */
export async function cancelPendingLobbyInvitesInTransaction(
  tx: Prisma.TransactionClient,
  lobbyId: string
): Promise<CanceledLobbyInvite[]> {
  const pending = await tx.lobbyInvite.findMany({
    where: { lobbyId, status: "PENDING" },
    select: { id: true, toUserId: true },
  });

  const canceled: CanceledLobbyInvite[] = [];
  for (const invite of pending) {
    const updated = await tx.lobbyInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    if (updated.count === 1) canceled.push(invite);
  }
  return canceled;
}

export async function publishCanceledLobbyInvites(
  canceled: readonly CanceledLobbyInvite[]
): Promise<void> {
  await Promise.all(
    canceled.map((invite) =>
      notifyUser(invite.toUserId, {
        type: "lobby:invite_canceled",
        inviteId: invite.id,
      })
    )
  );
}

export async function cancelPendingLobbyInvites(
  lobbyId: string
): Promise<void> {
  const pending = await prisma.lobbyInvite.findMany({
    where: { lobbyId, status: "PENDING" },
    select: { id: true, toUserId: true },
  });

  const canceled: CanceledLobbyInvite[] = [];
  for (const invite of pending) {
    const updated = await prisma.lobbyInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
    if (updated.count === 1) canceled.push(invite);
  }
  await publishCanceledLobbyInvites(canceled);
}
