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
      hostDeck: { select: { id: true, name: true } },
      guest: {
        select: {
          user: { select: { id: true, username: true, name: true, image: true } },
          deck: { select: { id: true, name: true } },
        },
      },
      gameSession: { select: { id: true } },
    },
  });

  if (!lobby) {
    return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: lobby.id,
    status: lobby.status,
    joinCode: lobby.joinCode,
    format: lobby.format,
    hostDeck: lobby.hostDeck,
    guest: lobby.guest,
    gameId: lobby.gameSession?.id ?? null,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
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
