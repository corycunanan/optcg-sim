/**
 * GET    /api/lobbies/[id] — Poll lobby status (host uses this to discover game start)
 * PATCH  /api/lobbies/[id] — Mutate in-room mode, deck, and ready state
 * DELETE /api/lobbies/[id] — Cancel lobby (host only)
 */

import { NextRequest } from "next/server";
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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;

  const { id } = await params;

  const lobby = await prisma.lobby.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      joinCode: true,
      format: true,
      mode: true,
      hostReady: true,
      hostUserId: true,
      host: { select: { username: true, name: true, image: true } },
      hostDeck: {
        select: { id: true, name: true, leaderId: true, leaderArtUrl: true },
      },
      guest: {
        select: {
          guestReady: true,
          user: {
            select: { id: true, username: true, name: true, image: true },
          },
          deck: {
            select: {
              id: true,
              name: true,
              leaderId: true,
              leaderArtUrl: true,
            },
          },
        },
      },
      gameSession: { select: { id: true } },
    },
  });

  if (!lobby) {
    return apiError("Lobby not found", 404);
  }

  const leaderIds = lobby.hostDeck ? [lobby.hostDeck.leaderId] : [];
  if (lobby.guest?.deck?.leaderId) leaderIds.push(lobby.guest.deck.leaderId);
  const leaderCards = await prisma.card.findMany({
    where: { id: { in: leaderIds } },
    select: { id: true, name: true, imageUrl: true },
  });
  const leaderMap = new Map(leaderCards.map((c) => [c.id, c]));

  const hostLeader = lobby.hostDeck
    ? leaderMap.get(lobby.hostDeck.leaderId)
    : null;
  const guestLeader = lobby.guest?.deck
    ? leaderMap.get(lobby.guest.deck.leaderId)
    : null;

  return apiSuccess(
    {
      id: lobby.id,
      status: userIsEvictedFromLobby(lobby, authResult.userId)
        ? "EVICTED"
        : lobby.status,
      joinCode: lobby.joinCode,
      format: lobby.format,
      mode: lobby.mode,
      hostReady: lobby.hostReady,
      hostUserId: lobby.hostUserId,
      host: lobby.host,
      hostDeck: lobby.hostDeck
        ? {
            ...lobby.hostDeck,
            leaderName: hostLeader?.name ?? null,
            leaderImageUrl:
              lobby.hostDeck.leaderArtUrl ?? hostLeader?.imageUrl ?? null,
          }
        : null,
      guest: lobby.guest
        ? {
            ...lobby.guest,
            deck: lobby.guest.deck
              ? {
                  ...lobby.guest.deck,
                  leaderName: guestLeader?.name ?? null,
                  leaderImageUrl:
                    lobby.guest.deck.leaderArtUrl ??
                    guestLeader?.imageUrl ??
                    null,
                }
              : null,
          }
        : null,
      gameId: lobby.gameSession?.id ?? null,
    },
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

  return apiAction();
}

type LobbyPollResult = {
  status: string;
  hostUserId: string;
  guest: { user: { id: string } } | null;
};

function userIsEvictedFromLobby(lobby: LobbyPollResult, userId: string) {
  if (lobby.hostUserId === userId) return false;
  if (lobby.status !== "WAITING" && lobby.status !== "READY") return false;
  return lobby.guest?.user.id !== userId;
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

  return apiAction();
}
