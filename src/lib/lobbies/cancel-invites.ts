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

import { prisma } from "@/lib/db";
import { notifyUser } from "@/lib/realtime/fan-out";

export async function cancelPendingLobbyInvites(lobbyId: string): Promise<void> {
  const pending = await prisma.lobbyInvite.findMany({
    where: { lobbyId, status: "PENDING" },
    select: { id: true, toUserId: true },
  });

  if (pending.length === 0) return;

  await prisma.lobbyInvite.updateMany({
    where: { lobbyId, status: "PENDING" },
    data: { status: "CANCELED" },
  });

  await Promise.all(
    pending.map((invite) =>
      notifyUser(invite.toUserId, {
        type: "lobby:invite_canceled",
        inviteId: invite.id,
      }),
    ),
  );
}
