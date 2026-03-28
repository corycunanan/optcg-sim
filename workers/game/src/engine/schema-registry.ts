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

import type { EffectSchema, EffectBlock, Action } from "./effect-types.js";
import { OP01_SCHEMAS } from "./schemas/op01.js";
import { OP02_SCHEMAS } from "./schemas/op02.js";
import { OP03_SCHEMAS } from "./schemas/op03.js";
import { OP04_SCHEMAS } from "./schemas/op04.js";
import { OP05_SCHEMAS } from "./schemas/op05.js";
import { OP06_SCHEMAS } from "./schemas/op06.js";
import { OP07_SCHEMAS } from "./schemas/op07.js";
import { OP08_SCHEMAS } from "./schemas/op08.js";
import { OP09_SCHEMAS } from "./schemas/op09.js";
import { OP10_SCHEMAS } from "./schemas/op10.js";
import { OP11_SCHEMAS } from "./schemas/op11.js";
import { OP12_SCHEMAS } from "./schemas/op12.js";
import { OP13_SCHEMAS } from "./schemas/op13.js";
import { OP14_SCHEMAS } from "./schemas/op14.js";
import { OP15_SCHEMAS } from "./schemas/op15.js";
import { EB01_SCHEMAS } from "./schemas/eb01.js";
import { EB02_SCHEMAS } from "./schemas/eb02.js";
import { EB03_SCHEMAS } from "./schemas/eb03.js";
import { EB04_SCHEMAS } from "./schemas/eb04.js";
import { PRB01_SCHEMAS } from "./schemas/prb01.js";
import { PRB02_SCHEMAS } from "./schemas/prb02.js";
import { ST01_SCHEMAS } from "./schemas/st01.js";
import { ST02_SCHEMAS } from "./schemas/st02.js";
import { ST03_SCHEMAS } from "./schemas/st03.js";
import { ST04_SCHEMAS } from "./schemas/st04.js";
import { ST05_SCHEMAS } from "./schemas/st05.js";
import { ST06_SCHEMAS } from "./schemas/st06.js";
import { ST07_SCHEMAS } from "./schemas/st07.js";
import { ST08_SCHEMAS } from "./schemas/st08.js";
import { ST09_SCHEMAS } from "./schemas/st09.js";
import { ST10_SCHEMAS } from "./schemas/st10.js";
import { ACE_DECK_SCHEMAS } from "./schemas/ace-deck.js";
import { NAMI_DECK_SCHEMAS } from "./schemas/nami-deck.js";

/** All pre-authored schemas, keyed by card ID */
const AUTHORED_SCHEMAS: Record<string, EffectSchema> = {
  ...OP01_SCHEMAS,
  ...OP02_SCHEMAS,
  ...OP03_SCHEMAS,
  ...OP04_SCHEMAS,
  ...OP05_SCHEMAS,
  ...OP06_SCHEMAS,
  ...OP07_SCHEMAS,
  ...OP08_SCHEMAS,
  ...OP09_SCHEMAS,
  ...OP10_SCHEMAS,
  ...OP11_SCHEMAS,
  ...OP12_SCHEMAS,
  ...OP13_SCHEMAS,
  ...OP14_SCHEMAS,
  ...OP15_SCHEMAS,
  ...EB01_SCHEMAS,
  ...EB02_SCHEMAS,
  ...EB03_SCHEMAS,
  ...EB04_SCHEMAS,
  ...PRB01_SCHEMAS,
  ...PRB02_SCHEMAS,
  ...ST01_SCHEMAS,
  ...ST02_SCHEMAS,
  ...ST03_SCHEMAS,
  ...ST04_SCHEMAS,
  ...ST05_SCHEMAS,
  ...ST06_SCHEMAS,
  ...ST07_SCHEMAS,
  ...ST08_SCHEMAS,
  ...ST09_SCHEMAS,
  ...ST10_SCHEMAS,
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
 * Validates each schema and logs warnings for malformed entries.
 */
export function injectSchemasIntoCardDb(
  cardDb: Map<string, import("../types.js").CardData>,
): void {
  for (const [cardId, schema] of Object.entries(AUTHORED_SCHEMAS)) {
    const errors = validateEffectSchema(schema, cardId);
    if (errors.length > 0) {
      console.warn(`[schema] Validation errors for ${cardId}:\n  ${errors.join("\n  ")}`);
    }
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

// ─── Schema Validation ───────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set(["auto", "activate", "permanent", "replacement", "rule_modification"]);

const VALID_ACTION_TYPES = new Set([
  // Card Movement
  "DRAW", "SEARCH_DECK", "TRASH_CARD", "KO", "RETURN_TO_HAND", "RETURN_TO_DECK",
  "PLAY_CARD", "MILL", "REVEAL", "REVEAL_HAND", "FULL_DECK_SEARCH", "DECK_SCRY",
  "SEARCH_AND_PLAY", "SEARCH_TRASH_THE_REST", "PLACE_HAND_TO_DECK", "HAND_WHEEL",
  "SHUFFLE_DECK",
  // Life
  "ADD_TO_LIFE", "ADD_TO_LIFE_FROM_DECK", "ADD_TO_LIFE_FROM_HAND",
  "ADD_TO_LIFE_FROM_FIELD", "PLAY_FROM_LIFE", "LIFE_TO_HAND", "TRASH_FROM_LIFE",
  "DRAIN_LIFE_TO_THRESHOLD", "LIFE_CARD_TO_DECK", "TRASH_FACE_UP_LIFE",
  "TURN_LIFE_FACE_UP", "TURN_LIFE_FACE_DOWN", "TURN_ALL_LIFE_FACE_DOWN",
  "LIFE_SCRY", "REORDER_ALL_LIFE",
  // Power & Stats
  "MODIFY_POWER", "SET_BASE_POWER", "SET_POWER_TO_ZERO", "MODIFY_COST", "SET_COST",
  "SWAP_BASE_POWER", "COPY_POWER",
  // Keywords
  "GRANT_KEYWORD", "REMOVE_KEYWORD", "NEGATE_EFFECTS", "GRANT_COUNTER", "GRANT_ATTRIBUTE",
  // DON!!
  "GIVE_DON", "RETURN_DON_TO_DECK", "ADD_DON_FROM_DECK", "SET_DON_ACTIVE", "REST_DON",
  "REDISTRIBUTE_DON", "FORCE_OPPONENT_DON_RETURN", "REST_OPPONENT_DON",
  "GIVE_OPPONENT_DON_TO_OPPONENT", "DISTRIBUTE_DON", "RETURN_ATTACHED_DON_TO_COST",
  // State Change
  "SET_ACTIVE", "SET_REST", "APPLY_PROHIBITION", "REMOVE_PROHIBITION",
  // Meta / Flow
  "PLAYER_CHOICE", "OPPONENT_CHOICE", "CHOOSE_VALUE", "WIN_GAME",
  "OPPONENT_ACTION", "EXTRA_TURN", "SCHEDULE_ACTION",
  // Battle
  "REDIRECT_ATTACK", "DEAL_DAMAGE", "SELF_TAKE_DAMAGE",
  // Effect / Meta
  "ACTIVATE_EVENT_FROM_HAND", "ACTIVATE_EVENT_FROM_TRASH", "REUSE_EFFECT",
  "NEGATE_TRIGGER_TYPE", "TRASH_FROM_HAND", "RETURN_HAND_TO_DECK",
  "APPLY_ONE_TIME_MODIFIER", "PLAY_SELF",
]);

/**
 * Validate an effect schema and return a list of error messages.
 * Returns an empty array if the schema is valid.
 */
export function validateEffectSchema(schema: EffectSchema, cardId?: string): string[] {
  const errors: string[] = [];
  const prefix = cardId ? `[${cardId}]` : "";

  if (!schema.effects || !Array.isArray(schema.effects)) {
    errors.push(`${prefix} Missing or non-array 'effects' field`);
    return errors;
  }

  const blockIds = new Set<string>();

  for (let i = 0; i < schema.effects.length; i++) {
    const block = schema.effects[i];
    const blockPrefix = `${prefix} effects[${i}]`;

    // Check id uniqueness
    if (!block.id) {
      errors.push(`${blockPrefix}: Missing 'id' field`);
    } else if (blockIds.has(block.id)) {
      errors.push(`${blockPrefix}: Duplicate block id '${block.id}'`);
    } else {
      blockIds.add(block.id);
    }

    // Check category
    if (!block.category) {
      errors.push(`${blockPrefix}: Missing 'category' field`);
    } else if (!VALID_CATEGORIES.has(block.category)) {
      errors.push(`${blockPrefix}: Invalid category '${block.category}'`);
    }

    // Category-specific checks
    errors.push(...validateBlock(block, blockPrefix));
  }

  return errors;
}

function validateBlock(block: EffectBlock, prefix: string): string[] {
  const errors: string[] = [];

  switch (block.category) {
    case "auto":
    case "activate":
      if (!block.trigger) {
        errors.push(`${prefix}: '${block.category}' block missing 'trigger'`);
      }
      if (!block.actions || block.actions.length === 0) {
        errors.push(`${prefix}: '${block.category}' block missing 'actions'`);
      }
      break;

    case "permanent":
      if (!block.modifiers && !block.prohibitions) {
        errors.push(`${prefix}: 'permanent' block needs 'modifiers' or 'prohibitions'`);
      }
      break;

    case "replacement":
      if (!block.replaces) {
        errors.push(`${prefix}: 'replacement' block missing 'replaces'`);
      }
      if (!block.replacement_actions || block.replacement_actions.length === 0) {
        errors.push(`${prefix}: 'replacement' block missing 'replacement_actions'`);
      }
      break;
  }

  // Validate actions
  if (block.actions) {
    for (let i = 0; i < block.actions.length; i++) {
      errors.push(...validateAction(block.actions[i], `${prefix}.actions[${i}]`));
    }
  }

  if (block.replacement_actions) {
    for (let i = 0; i < block.replacement_actions.length; i++) {
      errors.push(...validateAction(block.replacement_actions[i], `${prefix}.replacement_actions[${i}]`));
    }
  }

  return errors;
}

function validateAction(action: Action, prefix: string): string[] {
  const errors: string[] = [];

  if (!action.type) {
    errors.push(`${prefix}: Missing 'type' field`);
  } else if (!VALID_ACTION_TYPES.has(action.type)) {
    errors.push(`${prefix}: Unknown action type '${action.type}'`);
  }

  // Validate nested actions in PLAYER_CHOICE/OPPONENT_CHOICE
  if ((action.type === "PLAYER_CHOICE" || action.type === "OPPONENT_CHOICE") && action.params?.options) {
    const options = action.params.options as Action[][];
    if (!Array.isArray(options)) {
      errors.push(`${prefix}: 'options' must be an array of action arrays`);
    } else {
      for (let i = 0; i < options.length; i++) {
        if (!Array.isArray(options[i])) {
          errors.push(`${prefix}.options[${i}]: Must be an array of actions`);
        } else {
          for (let j = 0; j < options[i].length; j++) {
            errors.push(...validateAction(options[i][j], `${prefix}.options[${i}][${j}]`));
          }
        }
      }
    }
  }

  // Validate nested action in OPPONENT_ACTION
  if (action.type === "OPPONENT_ACTION" && action.params?.action) {
    errors.push(...validateAction(action.params.action as Action, `${prefix}.params.action`));
  }

  // Validate nested action in SCHEDULE_ACTION
  if (action.type === "SCHEDULE_ACTION" && action.params?.action) {
    errors.push(...validateAction(action.params.action as Action, `${prefix}.params.action`));
  }

  return errors;
}
