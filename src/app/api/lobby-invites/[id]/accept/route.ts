/**
 * POST /api/lobby-invites/[id]/accept — Recipient accepts a lobby invite.
 *
 * Mirrors the join flow in `POST /api/lobbies/join` (creates a `LobbyGuest`
 * row, flips the lobby `WAITING → READY`, fans out `lobby:state_changed` to
 * the host) — by id rather than by code, with the recipient gate.
 *
 * Idempotent on the invite row: a second call after ACCEPTED returns 410.
 *
 * Returns `{ lobbyId }` so the caller can `router.push("/lobbies/<id>")`.
 */

import { after, NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-invite-accept:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id: inviteId } = await params;

  const invite = await prisma.lobbyInvite.findUnique({
    where: { id: inviteId },
    include: {
      lobby: { include: { guest: true } },
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

  if (invite.expiresAt.getTime() <= Date.now()) {
    // Best-effort: roll the row to EXPIRED so the next reconciliation sweep
    // doesn't keep handing it to the recipient. Failures here are silent.
    void prisma.lobbyInvite
      .update({ where: { id: inviteId }, data: { status: "EXPIRED" } })
      .catch(() => undefined);
    return apiError("Invite has expired", 410);
  }

  const lobby = invite.lobby;
  if (lobby.status !== "WAITING") {
    return apiError("Lobby is no longer accepting guests", 409);
  }

  if (lobby.mode !== "PVP") {
    return apiError("Lobby is not in PVP mode", 409);
  }

  if (lobby.guest && lobby.guest.userId !== lobby.hostUserId) {
    return apiError("Lobby already has a guest", 409);
  }

  if (lobby.hostUserId === userId) {
    return apiError("You cannot accept an invite to your own lobby", 409);
  }

  await prisma.$transaction([
    prisma.lobbyGuest.create({
      data: { lobbyId: lobby.id, userId },
    }),
    prisma.lobby.update({
      where: { id: lobby.id },
      data: { status: "READY" },
    }),
    prisma.lobbyInvite.update({
      where: { id: inviteId },
      data: { status: "ACCEPTED" },
    }),
  ]);

  after(async () => {
    const state = await buildLobbyRoomState(lobby.id);
    if (!state) return;
    // Same actor-skip semantics as `POST /api/lobbies/join` — the new guest
    // navigates from this route's response, the host learns from the push.
    await notifyLobby(state, { actorUserId: userId });
  });

  return apiSuccess({ lobbyId: lobby.id });
}
