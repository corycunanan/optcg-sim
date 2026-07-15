import type { Card } from "@prisma/client";
import type { GameInitPayload, LobbyMode } from "@shared/game-init";
import { toCardData } from "@/lib/game/card-data";

type DeckCardWithCard = {
  card: Card;
  quantity: number;
  selectedArtUrl: string | null;
};

type DeckForGameInit = {
  leaderArtUrl: string | null;
  sleeveUrl: string | null;
  donArtUrl: string | null;
  testOrder: unknown;
  cards: DeckCardWithCard[];
};

type BuildGameInitPayloadInput = {
  gameId: string;
  format: string;
  mode: LobbyMode;
  player1: {
    userId: string;
    leader: Card;
    deck: DeckForGameInit;
  };
  player2: {
    userId: string;
    leader: Card;
    deck: DeckForGameInit;
  };
};

function asTestOrder(value: unknown): { life: string[]; hand: string[] } | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const order = value as Record<string, unknown>;
  const life = order.life;
  const hand = order.hand;
  if (
    !Array.isArray(life) ||
    !life.every((cardId): cardId is string => typeof cardId === "string") ||
    !Array.isArray(hand) ||
    !hand.every((cardId): cardId is string => typeof cardId === "string")
  ) {
    return undefined;
  }
  return { life, hand };
}

function buildPlayerInit(
  userId: string,
  leader: Card,
  deck: DeckForGameInit,
): GameInitPayload["player1"] {
  return {
    userId,
    sleeveUrl: deck.sleeveUrl ?? null,
    donArtUrl: deck.donArtUrl ?? null,
    testOrder: asTestOrder(deck.testOrder) ?? null,
    leader: {
      cardId: leader.id,
      quantity: 1,
      cardData: {
        ...toCardData(leader),
        imageUrl: deck.leaderArtUrl ?? leader.imageUrl,
      },
    },
    deck: deck.cards.map((dc) => ({
      cardId: dc.card.id,
      quantity: dc.quantity,
      cardData: {
        ...toCardData(dc.card),
        imageUrl: dc.selectedArtUrl ?? dc.card.imageUrl,
      },
    })),
  };
}

export function buildGameInitPayload(input: BuildGameInitPayloadInput): GameInitPayload {
  return {
    gameId: input.gameId,
    format: input.format,
    mode: input.mode,
    player1: buildPlayerInit(input.player1.userId, input.player1.leader, input.player1.deck),
    player2: buildPlayerInit(input.player2.userId, input.player2.leader, input.player2.deck),
  };
}
