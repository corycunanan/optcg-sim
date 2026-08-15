/**
 * Converts a Prisma Card row into the card-data shape used in GameInitPayload.
 */

import type { Card } from "@prisma/client";
import { extractKeywords } from "@/lib/game/keywords";
import type { CardData } from "@engine/types";
import { parseCardData } from "@engine/util/validate";

const CARD_TYPES = new Set(["Leader", "Character", "Event", "Stage"]);

function isGameCardType(
  value: string
): value is "Leader" | "Character" | "Event" | "Stage" {
  return CARD_TYPES.has(value);
}

export function toCardData(card: Card): CardData {
  if (!isGameCardType(card.type)) {
    throw new Error(`Unsupported card type for ${card.id}: ${card.type}`);
  }
  return parseCardData({
    id: card.id,
    name: card.name,
    type: card.type,
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
    // Card.effectSchema holds only the deck-legality subset materialized by
    // pipeline/sync-effect-schemas.ts ({ rule_modifications } with no
    // `effects` array), which fails the engine's full-schema validation. The
    // worker injects the authored registry at init and always prefers it, so
    // never ship the DB column across the wire.
    effectSchema: null,
    imageUrl: card.imageUrl,
  });
}
