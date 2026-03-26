/**
 * POST /api/lobbies/join — Join a lobby by code and auto-start the game.
 *
 * Body: { code: string, deckId: string }
 *
 * Creates a LobbyGuest record, a GameSession in PostgreSQL,
 * initializes the Durable Object, and returns { gameId } so the
 * guest can navigate directly to /game/{gameId}.
 *
 * The host discovers the game started via polling GET /api/lobbies/[id].
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeLobbyCode } from "@/lib/lobbies";
import { extractKeywords } from "@/lib/game/keywords";
import type { Card } from "@prisma/client";

const GAME_WORKER_URL = process.env.GAME_WORKER_URL ?? "";
const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  if (!GAME_WORKER_URL || !GAME_WORKER_SECRET) {
    console.error("GAME_WORKER_URL or GAME_WORKER_SECRET not configured");
    return NextResponse.json({ error: "Game server not configured" }, { status: 503 });
  }

  try {
    const { code, deckId } = (await request.json()) as {
      code: string;
      deckId: string;
    };

    if (!code || !deckId) {
      return NextResponse.json(
        { error: "code and deckId are required" },
        { status: 400 },
      );
    }

    const normalizedCode = normalizeLobbyCode(code);
    if (normalizedCode.length < 4) {
      return NextResponse.json({ error: "Invalid lobby code" }, { status: 400 });
    }

    // Verify guest's deck belongs to them
    const guestDeck = await prisma.deck.findFirst({
      where: { id: deckId, userId },
      include: { cards: { include: { card: true } } },
    });
    if (!guestDeck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    // Find the lobby by join code
    const lobby = await prisma.lobby.findFirst({
      where: { joinCode: normalizedCode, status: "WAITING" },
      include: {
        hostDeck: { include: { cards: { include: { card: true } } } },
        guest: true,
      },
    });

    if (!lobby) {
      return NextResponse.json(
        { error: "Lobby not found or already started" },
        { status: 404 },
      );
    }

    if (lobby.hostUserId === userId) {
      return NextResponse.json(
        { error: "You cannot join your own lobby" },
        { status: 409 },
      );
    }

    if (lobby.guest) {
      return NextResponse.json(
        { error: "Lobby already has a guest" },
        { status: 409 },
      );
    }

    // Fetch leader cards (leaders are NOT in DeckCard)
    const [hostLeader, guestLeader] = await Promise.all([
      prisma.card.findUnique({ where: { id: lobby.hostDeck.leaderId } }),
      prisma.card.findUnique({ where: { id: guestDeck.leaderId } }),
    ]);

    if (!hostLeader || !guestLeader) {
      return NextResponse.json({ error: "Leader card not found" }, { status: 422 });
    }

    const toCardData = (card: Card) => ({
      id: card.id,
      name: card.name,
      type: card.type as "Leader" | "Character" | "Event" | "Stage",
      color: card.color,
      cost: card.cost,
      power: card.power,
      counter: card.counter,
      life: card.life,
      attribute: card.attribute,
      types: card.traits,
      effectText: card.effectText,
      triggerText: card.triggerText ?? null,
      keywords: extractKeywords(card.effectText, card.triggerText ?? null),
      effectSchema: card.effectSchema ?? null,
      imageUrl: card.imageUrl,
    });

    // Create LobbyGuest, GameSession, and mark lobby IN_GAME.
    // Uses sequential writes instead of an interactive $transaction to avoid
    // connection-pool exhaustion (Neon PgBouncer with connection_limit=1).
    await prisma.lobbyGuest.create({
      data: { lobbyId: lobby.id, userId, deckId },
    });

    const gameSession = await prisma.gameSession.upsert({
      where: { lobbyId: lobby.id },
      create: {
        lobbyId: lobby.id,
        player1Id: lobby.hostUserId,
        player2Id: userId,
        player1DeckId: lobby.hostDeckId,
        player2DeckId: deckId,
        format: lobby.format,
        status: "IN_PROGRESS",
      },
      update: { status: "IN_PROGRESS" },
    });

    await prisma.lobby.update({
      where: { id: lobby.id },
      data: { status: "IN_GAME" },
    });

    // Build init payload for the Durable Object
    const devDebug = process.env.NODE_ENV === "development" ? { searchersFirst: true } : undefined;
    const payload = {
      gameId: gameSession.id,
      format: lobby.format,
      player1: {
        userId: lobby.hostUserId,
        leader: { cardId: hostLeader.id, quantity: 1, cardData: toCardData(hostLeader) },
        deck: lobby.hostDeck.cards.map((dc) => ({
          cardId: dc.card.id,
          quantity: dc.quantity,
          cardData: toCardData(dc.card),
        })),
        ...(devDebug && { debug: devDebug }),
      },
      player2: {
        userId,
        leader: { cardId: guestLeader.id, quantity: 1, cardData: toCardData(guestLeader) },
        deck: guestDeck.cards.map((dc) => ({
          cardId: dc.card.id,
          quantity: dc.quantity,
          cardData: toCardData(dc.card),
        })),
        ...(devDebug && { debug: devDebug }),
      },
    };

    // Initialize the Durable Object
    const workerRes = await fetch(`${GAME_WORKER_URL}/game/${gameSession.id}/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GAME_WORKER_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    if (!workerRes.ok) {
      const workerErr = await workerRes.text().catch(() => "unknown");
      console.error("Worker init failed:", workerRes.status, workerErr);
      // Roll back the game session — lobby stays IN_GAME to prevent re-join races,
      // but the host can cancel/recreate.
      await prisma.gameSession.delete({ where: { id: gameSession.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Failed to initialize game server" },
        { status: 502 },
      );
    }

    return NextResponse.json({ gameId: gameSession.id });
  } catch (error) {
    console.error("Lobby join error:", error);
    return NextResponse.json({ error: "Failed to join lobby" }, { status: 500 });
  }
}
