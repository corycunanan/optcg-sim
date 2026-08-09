import type { Card } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  validateDeck,
  type DeckCard,
  type DeckLeader,
  type DeckValidation,
  type ValidationResult,
} from "@/lib/deck-builder/validation";

export const DECK_INVALID_CODE = "DECK_INVALID";

type DeckCardRow = {
  cardId: string;
  quantity: number;
  selectedArtUrl: string | null;
};

type PlayableDeck = {
  id: string;
  userId: string;
  name: string;
  leaderId: string;
  leaderArtUrl: string | null;
  sleeveUrl: string | null;
  donArtUrl: string | null;
  testOrder: unknown;
  format: string;
  cards: Array<DeckCardRow & { card: Card }>;
};

export type PlayableDeckInvalidDetail = Pick<
  ValidationResult,
  "id" | "rule" | "message" | "severity" | "passed" | "cardIds"
>;

export class DeckNotFoundError extends Error {
  constructor() {
    super("Deck not found");
    this.name = "DeckNotFoundError";
  }
}

export class DeckInvalidError extends Error {
  readonly code = DECK_INVALID_CODE;
  readonly details: PlayableDeckInvalidDetail[];
  readonly validation: DeckValidation;

  constructor(validation: DeckValidation) {
    super("Deck is not playable");
    this.name = "DeckInvalidError";
    this.validation = validation;
    this.details = validation.results.filter(
      (result) => !result.passed && result.severity === "error"
    );
  }
}

function toValidationCard(row: DeckCardRow, card: Card): DeckCard {
  return {
    cardId: row.cardId,
    quantity: row.quantity,
    card: {
      id: card.id,
      name: card.name,
      color: card.color,
      type: card.type,
      cost: card.cost,
      power: card.power,
      counter: card.counter,
      attribute: card.attribute,
      effectText: card.effectText,
      triggerText: card.triggerText,
      imageUrl: card.imageUrl,
      banStatus: card.banStatus,
      blockNumber: card.blockNumber,
      traits: card.traits,
      rarity: card.rarity,
      effectSchema: card.effectSchema,
    },
  };
}

function toValidationLeader(card: Card): DeckLeader {
  return {
    id: card.id,
    name: card.name,
    color: card.color,
    type: card.type,
    life: card.life,
    power: card.power,
    imageUrl: card.imageUrl,
    traits: card.traits,
    effectText: card.effectText,
    effectSchema: card.effectSchema,
  };
}

function failedResult(
  id: string,
  rule: string,
  message: string,
  cardIds?: string[]
): ValidationResult {
  return {
    id,
    rule,
    message,
    severity: "error",
    passed: false,
    ...(cardIds?.length ? { cardIds } : {}),
  };
}

export async function requirePlayableDeck(
  deckId: string,
  userId: string
): Promise<{ deck: PlayableDeck; leader: Card; validation: DeckValidation }> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    select: {
      id: true,
      userId: true,
      name: true,
      leaderId: true,
      leaderArtUrl: true,
      sleeveUrl: true,
      donArtUrl: true,
      testOrder: true,
      format: true,
      cards: {
        select: {
          cardId: true,
          quantity: true,
          selectedArtUrl: true,
        },
      },
    },
  });

  if (!deck) {
    throw new DeckNotFoundError();
  }

  const requestedCardIds = [
    deck.leaderId,
    ...deck.cards.map((deckCard) => deckCard.cardId),
  ];
  const cards = await prisma.card.findMany({
    where: { id: { in: [...new Set(requestedCardIds)] } },
  });
  const cardById = new Map(cards.map((card) => [card.id, card]));

  const leaderCard = cardById.get(deck.leaderId);
  const leader =
    leaderCard?.type === "Leader" ? toValidationLeader(leaderCard) : null;
  const validationCards = deck.cards.flatMap((deckCard) => {
    const card = cardById.get(deckCard.cardId);
    return card ? [toValidationCard(deckCard, card)] : [];
  });
  const validation = validateDeck(leader, validationCards);
  const results = [...validation.results];

  if (leaderCard && leaderCard.type !== "Leader") {
    results.push(
      failedResult(
        "leader-type",
        "Leader",
        `${leaderCard.name} is not a Leader card`,
        [leaderCard.id]
      )
    );
  }

  const missingCardIds = deck.cards
    .map((deckCard) => deckCard.cardId)
    .filter((cardId) => !cardById.has(cardId));
  if (missingCardIds.length > 0) {
    results.push(
      failedResult(
        "missing-card",
        "Card IDs",
        `${missingCardIds.length} card ID(s) could not be found`,
        missingCardIds
      )
    );
  }

  const fullValidation: DeckValidation = {
    ...validation,
    results,
    isValid: results.every(
      (result) => result.passed || result.severity === "warning"
    ),
  };

  if (!fullValidation.isValid || !leaderCard || leaderCard.type !== "Leader") {
    throw new DeckInvalidError(fullValidation);
  }

  return {
    deck: {
      ...deck,
      cards: deck.cards.map((deckCard) => {
        const card = cardById.get(deckCard.cardId);
        if (!card) {
          throw new Error(
            `Validated card missing from lookup: ${deckCard.cardId}`
          );
        }
        return { ...deckCard, card };
      }),
    },
    leader: leaderCard,
    validation: fullValidation,
  };
}
