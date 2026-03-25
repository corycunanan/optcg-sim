/**
 * Effect Schema Registry
 *
 * Central lookup for card effectSchema data.
 * In production, schemas are stored in the DB (Card.effectSchema field).
 * This module provides a runtime registry for the engine worker,
 * populated from the DB on game init.
 *
 * During development and testing, we also provide pre-authored schemas
 * from the schemas/ directory.
 */

import type { EffectSchema } from "./effect-types.js";
import { OP01_SCHEMAS } from "./schemas/op01.js";
import { ACE_DECK_SCHEMAS } from "./schemas/ace-deck.js";
import { NAMI_DECK_SCHEMAS } from "./schemas/nami-deck.js";

/** All pre-authored schemas, keyed by card ID */
const AUTHORED_SCHEMAS: Record<string, EffectSchema> = {
  ...OP01_SCHEMAS,
  ...ACE_DECK_SCHEMAS,
  ...NAMI_DECK_SCHEMAS,
};

/**
 * Get the effect schema for a card by ID.
 * Returns null if the card has no authored schema.
 */
export function getEffectSchema(cardId: string): EffectSchema | null {
  return AUTHORED_SCHEMAS[cardId] ?? null;
}

/**
 * Merge authored schemas into a CardDb's effectSchema fields.
 * Called at game init to inject schemas into the runtime card database.
 */
export function injectSchemasIntoCardDb(
  cardDb: Map<string, import("../types.js").CardData>,
): void {
  for (const [cardId, schema] of Object.entries(AUTHORED_SCHEMAS)) {
    const data = cardDb.get(cardId);
    if (data && !data.effectSchema) {
      cardDb.set(cardId, { ...data, effectSchema: schema });
    }
  }
}

/**
 * List all card IDs with authored schemas.
 */
export function listAuthoredSchemas(): string[] {
  return Object.keys(AUTHORED_SCHEMAS);
}
