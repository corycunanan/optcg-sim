/**
 * GET    /api/lobbies/[id] — Poll lobby status (host uses this to discover game start)
 * PATCH  /api/lobbies/[id] — Mutate in-room mode, deck, and ready state
 * DELETE /api/lobbies/[id] — Cancel lobby (host only)
 */

import { after, NextRequest } from "next/server";
import {
  requireAuth,
  apiSuccess,
  apiAction,
  apiError,
} from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { PatchLobbySchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";
import { buildLobbyRoomState } from "@/lib/lobbies/build-state";
import { cancelPendingLobbyInvites } from "@/lib/lobbies/cancel-invites";
import { viewerIsEvicted } from "@/lib/lobbies/state";
import { notifyUser } from "@/lib/realtime/fan-out";
import { notifyLobby } from "@/lib/realtime/fanout-lobby";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;

  const { id } = await params;

  const state = await buildLobbyRoomState(id);
  if (!state) {
    return apiError("Lobby not found", 404);
  }

  return apiSuccess(
    viewerIsEvicted(state, authResult.userId)
      ? { ...state, status: "EVICTED" as const }
      : state,
    200,
    { "Cache-Control": "no-store" }
  );
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-update:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;
  const parsed = await parseBody(request, PatchLobbySchema);
  if (isErrorResponse(parsed)) return parsed;

  const force = request.nextUrl.searchParams.get("force") === "true";
  const lobby = await prisma.lobby.findUnique({
    where: { id },
    include: {
      guest: {
        include: {
          user: { select: { id: true, username: true, name: true } },
        },
      },
    },
  });

  if (!lobby || (lobby.status !== "WAITING" && lobby.status !== "READY")) {
    return apiError("Lobby not found or already started", 404);
  }

  const isHost = lobby.hostUserId === userId;
  const isGuest = lobby.guest?.userId === userId && !isHost;
  if (!isHost && !isGuest) {
    return apiError("Forbidden", 403);
  }

  const hasHostControlledChange =
    parsed.mode !== undefined ||
    parsed.format !== undefined ||
    parsed.hostDeckId !== undefined;
  if (hasHostControlledChange && !isHost) {
    return apiError("Forbidden", 403);
  }

  if (parsed.mode === "PVCOMPUTER") {
    return apiError("PVComputer mode is not yet implemented", 501);
  }

  const targetMode = parsed.mode ?? lobby.mode;
  if (parsed.guestDeckId !== undefined) {
    if (targetMode === "PVCOMPUTER") {
      return apiError("PVComputer mode is not yet implemented", 501);
    }
    if (targetMode === "SOLITAIRE" && !isHost) {
      return apiError(
        "guestDeckId can only be changed by the host in Solitaire mode",
        403
      );
    }
    if (targetMode === "PVP" && !isGuest) {
      return apiError(
        "guestDeckId can only be changed by the guest in PVP mode",
        403
      );
    }
  }

  const guestReadyActorIsValid =
    (targetMode === "PVP" && isGuest) || (targetMode === "SOLITAIRE" && isHost);

  if (parsed.ready === true) {
    if (isHost) {
      if (hasHostControlledChange) {
        return apiError(
          "Ready cannot be set while changing host-controlled settings",
          400
        );
      }
      if (!lobby.hostDeckId) {
        return apiError("Select a deck before readying", 422, {
          code: "DECK_REQUIRED",
        });
      }
    } else if (isGuest) {
      if (parsed.guestDeckId !== undefined) {
        return apiError("Ready cannot be set while changing decks", 400);
      }
      if (!lobby.guest?.deckId) {
        return apiError("Select a deck before readying", 422, {
          code: "DECK_REQUIRED",
        });
      }
    }
  }

  if (parsed.ready !== undefined && !isHost && !guestReadyActorIsValid) {
    return apiError("Ready cannot be changed in this lobby mode", 400);
  }

  if (parsed.hostDeckId) {
    const deck = await prisma.deck.findFirst({
      where: { id: parsed.hostDeckId, userId },
    });
    if (!deck) return apiError("Deck not found", 404);
  }

  if (parsed.guestDeckId) {
    const deck = await prisma.deck.findFirst({
      where: { id: parsed.guestDeckId, userId },
    });
    if (!deck) return apiError("Deck not found", 404);
  }

  const switchingToSolitaire =
    lobby.mode === "PVP" && targetMode === "SOLITAIRE";
  const realGuest =
    lobby.guest && lobby.guest.userId !== lobby.hostUserId ? lobby.guest : null;
  if (switchingToSolitaire && realGuest && !force) {
    return apiError("Guest is present", 409, {
      code: "GUEST_PRESENT",
      details: {
        guestUserId: realGuest.userId,
        guestUserName: realGuest.user.username ?? realGuest.user.name,
      },
    });
  }

  const lobbyData: Record<string, unknown> = {};
  if (parsed.mode !== undefined) lobbyData.mode = parsed.mode;
  if (parsed.format !== undefined) lobbyData.format = parsed.format;
  if (parsed.hostDeckId !== undefined) lobbyData.hostDeckId = parsed.hostDeckId;
  if (hasHostControlledChange) lobbyData.hostReady = false;
  if (isHost && parsed.ready !== undefined && !hasHostControlledChange) {
    lobbyData.hostReady = parsed.ready;
  }

  const operations = [];

  if (switchingToSolitaire) {
    operations.push(prisma.lobbyGuest.deleteMany({ where: { lobbyId: id } }));
    operations.push(
      prisma.lobbyGuest.upsert({
        where: { lobbyId: id },
        create: {
          lobbyId: id,
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
        update: {
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
      })
    );
    lobbyData.status = "READY";
  } else if (lobby.mode === "SOLITAIRE" && targetMode === "PVP") {
    operations.push(
      prisma.lobbyGuest.deleteMany({
        where: { lobbyId: id, userId: lobby.hostUserId },
      })
    );
    lobbyData.status = "WAITING";
    lobbyData.hostReady = false;
  } else if (targetMode === "SOLITAIRE" && isHost && !lobby.guest) {
    operations.push(
      prisma.lobbyGuest.upsert({
        where: { lobbyId: id },
        create: {
          lobbyId: id,
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
        update: {
          userId: lobby.hostUserId,
          deckId: parsed.guestDeckId ?? null,
          guestReady: false,
        },
      })
    );
  } else if (parsed.guestDeckId !== undefined) {
    operations.push(
      prisma.lobbyGuest.update({
        where: { lobbyId: id },
        data: { deckId: parsed.guestDeckId, guestReady: false },
      })
    );
  } else if (parsed.ready !== undefined && !isHost) {
    operations.push(
      prisma.lobbyGuest.update({
        where: { lobbyId: id },
        data: { guestReady: parsed.ready },
      })
    );
  }

  if (Object.keys(lobbyData).length > 0) {
    operations.push(prisma.lobby.update({ where: { id }, data: lobbyData }));
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  // Capture the ejected guest (if any) so the post-transaction fanout can
  // tell them their lobby is gone — switchingToSolitaire wipes them off the
  // freshly-built state.
  const ejectedGuestUserId =
    switchingToSolitaire && realGuest ? realGuest.userId : null;

  after(async () => {
    const state = await buildLobbyRoomState(id);
    if (!state) return;

    await notifyLobby(state, { actorUserId: userId });

    if (ejectedGuestUserId) {
      await notifyUser(ejectedGuestUserId, {
        type: "lobby:state_changed",
        lobby: { ...state, status: "EVICTED" },
      });
    }
  });

  return apiAction();
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-delete:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;

  const lobby = await prisma.lobby.findFirst({
    where: { id, hostUserId: userId, status: "WAITING" },
  });

  if (!lobby) {
    return apiError("Lobby not found or already started", 404);
  }

  await prisma.lobby.update({
    where: { id },
    data: { status: "CLOSED" },
  });

  after(async () => {
    // Pending invites for this lobby become moot the moment it closes; cancel
    // them and emit `lobby:invite_canceled` so any visible recipient toasts
    // dismiss without waiting on the 5-minute TTL.
    await cancelPendingLobbyInvites(id);

    const state = await buildLobbyRoomState(id);
    if (!state) return;

    // Today, DELETE only operates on `WAITING` lobbies — which by definition
    // have no guest, so this branch is dormant. Kept so a future broadening
    // of DELETE (e.g. host can also close a `READY` lobby) automatically
    // notifies the guest without re-discovering the fanout site.
    const guestUserId =
      state.guest && state.guest.user.id !== state.hostUserId
        ? state.guest.user.id
        : null;
    if (!guestUserId) return;

    await notifyUser(guestUserId, {
      type: "lobby:state_changed",
      lobby: { ...state, status: "CLOSED" },
    });
  });

  return apiAction();
}
