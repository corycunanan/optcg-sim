/**
 * GET    /api/lobbies/[id] — Poll lobby status (host uses this to discover game start)
 * DELETE /api/lobbies/[id] — Cancel lobby (host only)
 */

import { NextRequest } from "next/server";
import { requireAuth, apiSuccess, apiAction, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { UpdateLobbyDeckSchema } from "@/lib/validators/lobbies";
import { parseBody, isErrorResponse } from "@/lib/validators/helpers";
import { apiLimiter } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
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
      hostUserId: true,
      host: { select: { username: true, name: true, image: true } },
      hostDeck: { select: { id: true, name: true, leaderId: true, leaderArtUrl: true } },
      guest: {
        select: {
          user: { select: { id: true, username: true, name: true, image: true } },
          deck: { select: { id: true, name: true, leaderId: true, leaderArtUrl: true } },
        },
      },
      gameSession: { select: { id: true } },
    },
  });

  if (!lobby) {
    return apiError("Lobby not found", 404);
  }

  const leaderIds = [lobby.hostDeck.leaderId];
  if (lobby.guest?.deck?.leaderId) leaderIds.push(lobby.guest.deck.leaderId);
  const leaderCards = await prisma.card.findMany({
    where: { id: { in: leaderIds } },
    select: { id: true, name: true, imageUrl: true },
  });
  const leaderMap = new Map(leaderCards.map((c) => [c.id, c]));

  const hostLeader = leaderMap.get(lobby.hostDeck.leaderId);
  const guestLeader = lobby.guest?.deck
    ? leaderMap.get(lobby.guest.deck.leaderId)
    : null;

  return apiSuccess({
    id: lobby.id,
    status: lobby.status,
    joinCode: lobby.joinCode,
    format: lobby.format,
    host: lobby.host,
    hostDeck: {
      ...lobby.hostDeck,
      leaderName: hostLeader?.name ?? null,
      leaderImageUrl: lobby.hostDeck.leaderArtUrl ?? hostLeader?.imageUrl ?? null,
    },
    guest: lobby.guest
      ? {
          ...lobby.guest,
          deck: lobby.guest.deck
            ? {
                ...lobby.guest.deck,
                leaderName: guestLeader?.name ?? null,
                leaderImageUrl:
                  lobby.guest.deck.leaderArtUrl ?? guestLeader?.imageUrl ?? null,
              }
            : null,
        }
      : null,
    gameId: lobby.gameSession?.id ?? null,
  }, 200, { "Cache-Control": "no-store" });
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const { limited } = await apiLimiter.check(`lobby-update:${userId}`);
  if (limited) {
    return apiError("Too many requests. Try again later.", 429);
  }

  const { id } = await params;
  const parsed = await parseBody(request, UpdateLobbyDeckSchema);
  if (isErrorResponse(parsed)) return parsed;
  const { deckId } = parsed;

  const lobby = await prisma.lobby.findFirst({
    where: { id, hostUserId: userId, status: "WAITING" },
  });

  if (!lobby) {
    return apiError("Lobby not found or already started", 404);
  }

  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
  });

  if (!deck) {
    return apiError("Deck not found", 404);
  }

  await prisma.lobby.update({
    where: { id },
    data: { hostDeckId: deckId },
  });

  return apiAction();
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
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
