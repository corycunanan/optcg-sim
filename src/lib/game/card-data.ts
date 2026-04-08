/**
 * Converts a Prisma Card row into the card-data shape used in GameInitPayload.
 */

import type { Card } from "@prisma/client";
import { extractKeywords } from "@/lib/game/keywords";

export function toCardData(card: Card) {
  return {
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
  };
}
