/**
 * GET    /api/lobbies/[id] — Poll lobby status (host uses this to discover game start)
 * DELETE /api/lobbies/[id] — Cancel lobby (host only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  }

  // Resolve leader card images for host and guest decks
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

  return NextResponse.json({
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
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;
  const { deckId } = (await request.json()) as { deckId?: string };

  if (!deckId) {
    return NextResponse.json({ error: "deckId is required" }, { status: 400 });
  }

  const lobby = await prisma.lobby.findFirst({
    where: { id, hostUserId: userId, status: "WAITING" },
  });

  if (!lobby) {
    return NextResponse.json({ error: "Lobby not found or already started" }, { status: 404 });
  }

  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
  });

  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  await prisma.lobby.update({
    where: { id },
    data: { hostDeckId: deckId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const lobby = await prisma.lobby.findFirst({
    where: { id, hostUserId: userId, status: "WAITING" },
  });

  if (!lobby) {
    return NextResponse.json({ error: "Lobby not found or already started" }, { status: 404 });
  }

  await prisma.lobby.update({
    where: { id },
    data: { status: "CLOSED" },
  });

  return NextResponse.json({ ok: true });
}
