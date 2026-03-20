/**
 * POST /api/lobbies/[id]/start — Host starts the game (both players must be ready)
 * Creates a GameSession in PostgreSQL, POSTs the init payload to the Cloudflare DO,
 * and returns the gameId + worker URL so clients can connect via WebSocket.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { extractKeywords } from "@/lib/game/keywords";

const GAME_WORKER_URL = process.env.GAME_WORKER_URL ?? "";
const GAME_WORKER_SECRET = process.env.GAME_WORKER_SECRET ?? "";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const lobby = await prisma.lobby.findFirst({
      where: { id, hostUserId: userId },
      include: {
        guest: {
          include: {
            deck: {
              include: {
                cards: { include: { card: true } },
              },
            },
          },
        },
        hostDeck: {
          include: {
            cards: { include: { card: true } },
          },
        },
      },
    });

    if (!lobby) {
      return NextResponse.json({ error: "Lobby not found" }, { status: 404 });
    }
    if (lobby.status !== "READY") {
      return NextResponse.json(
        { error: "Lobby is not ready (needs a guest)" },
        { status: 409 },
      );
    }
    if (!lobby.guest) {
      return NextResponse.json({ error: "No guest in lobby" }, { status: 409 });
    }

    // Find leader cards for each deck
    const hostLeaderEntry = lobby.hostDeck.cards.find(
      (dc) => dc.card.type === "Leader",
    );
    const guestLeaderEntry = lobby.guest.deck.cards.find(
      (dc) => dc.card.type === "Leader",
    );

    if (!hostLeaderEntry || !guestLeaderEntry) {
      return NextResponse.json(
        { error: "One or both decks missing a leader" },
        { status: 422 },
      );
    }

    // Create GameSession record in PostgreSQL
    const gameSession = await prisma.gameSession.create({
      data: {
        lobbyId: id,
        player1Id: userId,
        player2Id: lobby.guest.userId,
        player1DeckId: lobby.hostDeckId,
        player2DeckId: lobby.guest.deckId,
        format: lobby.format,
        status: "IN_PROGRESS",
      },
    });

    // Build CardData mapper
    const toCardData = (card: typeof hostLeaderEntry.card) => ({
      id: card.id,
      name: card.name,
      type: card.type as "Leader" | "Character" | "Event" | "Stage",
      color: card.color,
      cost: card.cost,
      power: card.power,
      counter: card.counter,
      life: card.life,
      effectText: card.effectText,
      triggerText: card.triggerText ?? null,
      keywords: extractKeywords(card.effectText, card.triggerText ?? null),
      effectSchema: card.effectSchema ?? null,
    });

    // Build the init payload for the Durable Object
    const payload = {
      gameId: gameSession.id,
      format: lobby.format,
      player1: {
        userId,
        leader: {
          cardId: hostLeaderEntry.card.id,
          quantity: 1,
          cardData: toCardData(hostLeaderEntry.card),
        },
        deck: lobby.hostDeck.cards
          .filter((dc) => dc.card.type !== "Leader")
          .map((dc) => ({
            cardId: dc.card.id,
            quantity: dc.quantity,
            cardData: toCardData(dc.card),
          })),
      },
      player2: {
        userId: lobby.guest.userId,
        leader: {
          cardId: guestLeaderEntry.card.id,
          quantity: 1,
          cardData: toCardData(guestLeaderEntry.card),
        },
        deck: lobby.guest.deck.cards
          .filter((dc) => dc.card.type !== "Leader")
          .map((dc) => ({
            cardId: dc.card.id,
            quantity: dc.quantity,
            cardData: toCardData(dc.card),
          })),
      },
    };

    // Initialize the Durable Object for this game
    const workerRes = await fetch(
      `${GAME_WORKER_URL}/game/${gameSession.id}/init`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GAME_WORKER_SECRET}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!workerRes.ok) {
      // Roll back the game session if the DO init fails
      await prisma.gameSession.delete({ where: { id: gameSession.id } });
      return NextResponse.json(
        { error: "Failed to initialize game worker" },
        { status: 502 },
      );
    }

    // Mark lobby as in-game
    await prisma.lobby.update({
      where: { id },
      data: { status: "IN_GAME" },
    });

    return NextResponse.json({
      started: true,
      gameId: gameSession.id,
      workerUrl: GAME_WORKER_URL,
    });
  } catch (error) {
    console.error("Lobby start error:", error);
    return NextResponse.json({ error: "Failed to start game" }, { status: 500 });
  }
}
