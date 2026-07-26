/**
 * Effect Schema Registry
 *
 * Central lookup for card effectSchema data.
 * In production, schemas are stored in the DB (Card.effectSchema field).
 * This module provides a runtime registry for the engine worker,
 * populated from the DB on game init.
 *
 * Authored TypeScript schemas are compacted into a generated production
 * artifact. Validation tooling still loads every source module and enforces
 * exact source parity before this synchronous registry can ship.
 */

import {
  ACTION_TYPES_WITHOUT_RESOLVER_HANDLER,
  ALL_ACTION_TYPES,
  ALL_COST_TYPES,
  ALL_TARGET_TYPES,
  getNestedActions,
  type EffectSchema,
  type EffectBlock,
  type Action,
  type Controller,
  type Cost,
  type TargetFilter,
  type TargetType,
} from "./effect-types.js";
import { log } from "../lib/log.js";
import { SIMULTANEOUS_ACTION_TYPES } from "./effect-resolver/simultaneous.js";
import { AUTHORED_SCHEMAS } from "./authored-schemas.generated.js";
import { TARGET_FILTER_KEYS } from "../../../../shared/target-filter.js";

/**
 * Get the effect schema for a card by ID.
 * Returns null if the card has no authored schema.
 */
export function getEffectSchema(cardId: string): EffectSchema | null {
  const schema = AUTHORED_SCHEMAS[cardId];
  if (!schema) {
    log("schema.missing", { cardId });
    return null;
  }
  return schema;
}
/**
 * Merge authored schemas into a CardDb's effectSchema fields.
 * Called at game init to inject schemas into the runtime card database.
 * Validates the complete candidate registry before mutating the CardDb. A
 * malformed authored or DB-only schema is a boot error; partial installation
 * would leave a match with a nondeterministic mix of old and new contracts.
 */
export function injectSchemasIntoCardDb(
  cardDb: Map<string, import("../types.js").CardData>,
): void {
  const diagnostics: string[] = [];
  for (const [cardId, data] of cardDb) {
    const candidate = AUTHORED_SCHEMAS[cardId] ?? data.effectSchema;
    if (candidate) diagnostics.push(...validateEffectSchema(candidate, cardId));
  }
  for (const [cardId, schema] of Object.entries(AUTHORED_SCHEMAS)) {
    if (!cardDb.has(cardId)) {
      diagnostics.push(...validateEffectSchema(schema, cardId));
    }
  }
  if (diagnostics.length > 0) {
    throw new SchemaBootValidationError(diagnostics);
  }

  for (const [cardId, schema] of Object.entries(AUTHORED_SCHEMAS)) {
    const data = cardDb.get(cardId);
    if (data) {
      // Always prefer authored schemas over DB-stored schemas — they are the
      // most up-to-date and thoroughly tested versions.
      cardDb.set(cardId, { ...data, effectSchema: schema });
    }
  }
}

export class SchemaBootValidationError extends Error {
  readonly diagnostics: readonly string[];

  constructor(diagnostics: readonly string[]) {
    super(
      `Authored schema validation failed with ${diagnostics.length} error(s):\n${diagnostics.join("\n")}`,
    );
    this.name = "SchemaBootValidationError";
    this.diagnostics = [...diagnostics];
  }
}

/**
 * List all card IDs with authored schemas.
 */
export function listAuthoredSchemas(): string[] {
  return Object.keys(AUTHORED_SCHEMAS);
}

/**
 * Return all authored schemas keyed by card ID. Used by schema-lint tests
 * that need to iterate every registered schema.
 */
export function getAllAuthoredSchemas(): Record<string, EffectSchema> {
  return AUTHORED_SCHEMAS;
}

// ─── Schema Validation ───────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set(["auto", "activate", "permanent", "replacement", "rule_modification"]);

// OPT-202: derived from `ALL_ACTION_TYPES` so the schema spec can never drift
// from the `ActionType` union. Engine handler coverage is a separate concern
// asserted at worker boot in `effect-resolver/resolver.ts` (OPT-200).
const VALID_ACTION_TYPES: ReadonlySet<string> = new Set(ALL_ACTION_TYPES);
const UNHANDLED_ACTION_TYPES: ReadonlySet<string> = new Set(
  ACTION_TYPES_WITHOUT_RESOLVER_HANDLER,
);
const VALID_TARGET_TYPES: ReadonlySet<string> = new Set(ALL_TARGET_TYPES);
const VALID_COST_TYPES: ReadonlySet<string> = new Set(ALL_COST_TYPES);
const IMPLICIT_COST_RESULT_REFS = new Set([
  "__cost_don_rested",
  "__cost_cards_trashed",
  "__cost_cards_returned",
  "__cost_cards_placed_to_deck",
  "__cost_characters_ko",
]);
const VALID_ACTION_FIELDS: ReadonlySet<string> = new Set([
  "type", "params", "target", "duration", "chain", "target_ref",
  "result_ref", "conditions",
]);
const VALID_TARGET_FILTER_FIELDS: ReadonlySet<string> = new Set(
  TARGET_FILTER_KEYS,
);
const VALID_CONTROLLERS: ReadonlySet<Controller> = new Set([
  "SELF",
  "OPPONENT",
  "EITHER",
  "ANY",
]);
const SELF_OR_OPPONENT_CONTROLLERS: ReadonlySet<Controller> = new Set([
  "SELF",
  "OPPONENT",
]);
const TARGETABLE_CONTROLLERS: ReadonlySet<Controller> = new Set([
  "SELF",
  "OPPONENT",
  "EITHER",
]);
const SELF_CONTROLLER: ReadonlySet<Controller> = new Set(["SELF"]);
const OPPONENT_CONTROLLER: ReadonlySet<Controller> = new Set(["OPPONENT"]);
const NO_SLOT_CONTROLLERS: ReadonlySet<Controller> = new Set();
const DUAL_TARGET_SLOT_CONTROLLER_MODES = {
  SELF: NO_SLOT_CONTROLLERS,
  YOUR_LEADER: NO_SLOT_CONTROLLERS,
  OPPONENT_LEADER: NO_SLOT_CONTROLLERS,
  CHARACTER: TARGETABLE_CONTROLLERS,
  STAGE: SELF_OR_OPPONENT_CONTROLLERS,
  LEADER_OR_CHARACTER: TARGETABLE_CONTROLLERS,
  FIELD_CARD: TARGETABLE_CONTROLLERS,
  ALL_YOUR_CHARACTERS: NO_SLOT_CONTROLLERS,
  ALL_OPPONENT_CHARACTERS: NO_SLOT_CONTROLLERS,
  CHARACTER_CARD: SELF_OR_OPPONENT_CONTROLLERS,
  STAGE_CARD: SELF_OR_OPPONENT_CONTROLLERS,
  EVENT_CARD: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_IN_HAND: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_IN_TRASH: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_ON_TOP_OF_DECK: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_IN_DECK: SELF_OR_OPPONENT_CONTROLLERS,
  LIFE_CARD: NO_SLOT_CONTROLLERS,
  DON_IN_COST_AREA: SELF_OR_OPPONENT_CONTROLLERS,
  DON_ATTACHED: NO_SLOT_CONTROLLERS,
  DON_IN_DON_DECK: NO_SLOT_CONTROLLERS,
  PLAYER: SELF_OR_OPPONENT_CONTROLLERS,
  SELECTED_CARDS: NO_SLOT_CONTROLLERS,
  OPPONENT_LIFE: NO_SLOT_CONTROLLERS,
  TRIGGERING_CARD: NO_SLOT_CONTROLLERS,
  TRIGGERING_CARD_IN_TRASH: NO_SLOT_CONTROLLERS,
} satisfies Record<TargetType, ReadonlySet<Controller>>;

// Parent Target.controller support is deliberately exhaustive and fail-closed.
// Runtime target resolution cannot silently reinterpret a newly-authored mode:
// adding a TargetType is a compile error here, and an unknown lookup denies it.
// Fixed-scope target types tolerate the redundant controller forms already
// shipped in the authored corpus (for example SELF + SELF).
const TARGET_CONTROLLER_MODES = {
  SELF: SELF_CONTROLLER,
  YOUR_LEADER: SELF_CONTROLLER,
  OPPONENT_LEADER: OPPONENT_CONTROLLER,
  CHARACTER: TARGETABLE_CONTROLLERS,
  STAGE: TARGETABLE_CONTROLLERS,
  LEADER_OR_CHARACTER: TARGETABLE_CONTROLLERS,
  FIELD_CARD: TARGETABLE_CONTROLLERS,
  ALL_YOUR_CHARACTERS: SELF_CONTROLLER,
  ALL_OPPONENT_CHARACTERS: SELF_CONTROLLER,
  CHARACTER_CARD: SELF_OR_OPPONENT_CONTROLLERS,
  STAGE_CARD: SELF_OR_OPPONENT_CONTROLLERS,
  EVENT_CARD: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_IN_HAND: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_IN_TRASH: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_ON_TOP_OF_DECK: SELF_OR_OPPONENT_CONTROLLERS,
  CARD_IN_DECK: SELF_OR_OPPONENT_CONTROLLERS,
  LIFE_CARD: TARGETABLE_CONTROLLERS,
  DON_IN_COST_AREA: SELF_OR_OPPONENT_CONTROLLERS,
  DON_ATTACHED: NO_SLOT_CONTROLLERS,
  DON_IN_DON_DECK: NO_SLOT_CONTROLLERS,
  PLAYER: SELF_OR_OPPONENT_CONTROLLERS,
  SELECTED_CARDS: NO_SLOT_CONTROLLERS,
  OPPONENT_LIFE: OPPONENT_CONTROLLER,
  TRIGGERING_CARD: NO_SLOT_CONTROLLERS,
  TRIGGERING_CARD_IN_TRASH: SELF_CONTROLLER,
} satisfies Record<TargetType, ReadonlySet<Controller>>;

/**
 * Validate an effect schema and return a list of error messages.
 * Returns an empty array if the schema is valid.
 */
export function validateEffectSchema(schema: unknown, cardId?: string): string[] {
  const errors: string[] = [];
  const prefix = cardId ? `[${cardId}]` : "";

  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return [`${prefix} Schema must be an object`];
  }
  const candidate = schema as Partial<EffectSchema>;

  if (!candidate.effects || !Array.isArray(candidate.effects)) {
    errors.push(`${prefix} Missing or non-array 'effects' field`);
    return errors;
  }

  const blockIds = new Set<string>();

  for (let i = 0; i < candidate.effects.length; i++) {
    const block = candidate.effects[i] as EffectBlock;
    const blockPrefix = `${prefix} effects[${i}]`;

    if (!block || typeof block !== "object" || Array.isArray(block)) {
      errors.push(`${blockPrefix}: Effect block must be an object`);
      continue;
    }

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

  if (candidate.rule_modifications !== undefined) {
    errors.push(
      ...validateTargetFiltersInValue(
        candidate.rule_modifications,
        `${prefix} rule_modifications`,
      ),
    );
  }

  return errors;
}

function validateBlock(block: EffectBlock, prefix: string): string[] {
  const errors: string[] = [];

  errors.push(...validateTargetFiltersInValue(block, prefix));
  if (block.trigger !== undefined) {
    errors.push(...validateTriggerShape(block.trigger, `${prefix}.trigger`));
  }

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
      if (!block.modifiers && !block.prohibitions && !block.flags?.keywords?.length) {
        errors.push(
          `${prefix}: 'permanent' block needs 'modifiers', 'prohibitions', or non-empty 'flags.keywords'`,
        );
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

  // Validate costs
  if (block.costs) {
    for (let i = 0; i < block.costs.length; i++) {
      errors.push(...validateCost(block.costs[i], `${prefix}.costs[${i}]`, false));
    }
  }

  // Validate actions
  if (block.actions) {
    if (!Array.isArray(block.actions)) {
      errors.push(`${prefix}.actions: Must be an array`);
      return errors;
    }
    for (let i = 0; i < block.actions.length; i++) {
      errors.push(...validateAction(block.actions[i], `${prefix}.actions[${i}]`, i === 0));
    }
    errors.push(...validateActionConnectors(block.actions, `${prefix}.actions`));
    errors.push(...validateResultReferences(block.actions, `${prefix}.actions`));
  }

  if (block.replacement_actions) {
    if (!Array.isArray(block.replacement_actions)) {
      errors.push(`${prefix}.replacement_actions: Must be an array`);
      return errors;
    }
    for (let i = 0; i < block.replacement_actions.length; i++) {
      errors.push(...validateAction(
        block.replacement_actions[i],
        `${prefix}.replacement_actions[${i}]`,
        i === 0,
      ));
    }
    errors.push(...validateActionConnectors(
      block.replacement_actions,
      `${prefix}.replacement_actions`,
    ));
    errors.push(...validateResultReferences(
      block.replacement_actions,
      `${prefix}.replacement_actions`,
    ));
  }

  // OPT-409: permanent modifiers and prohibitions carry the same Target shape
  // and their runtime paths (effectAppliesToCard, prohibition matching) also
  // call matchesFilter without filterController — check their filters too.
  if (block.modifiers) {
    for (let i = 0; i < block.modifiers.length; i++) {
      errors.push(...validateTargetController(
        block.modifiers[i].target,
        `${prefix}.modifiers[${i}]`,
      ));
    }
  }
  if (block.prohibitions) {
    for (let i = 0; i < block.prohibitions.length; i++) {
      errors.push(...validateTargetController(
        block.prohibitions[i].target,
        `${prefix}.prohibitions[${i}]`,
      ));
    }
  }

  return errors;
}

export function validateCost(cost: Cost, prefix: string, insideChoice: boolean): string[] {
  const errors: string[] = [];

  if (!cost || typeof cost !== "object") {
    errors.push(`${prefix}: cost must be an object`);
    return errors;
  }

  if (!cost.type) {
    errors.push(`${prefix}: Missing 'type' field`);
    return errors;
  }
  if (!VALID_COST_TYPES.has(cost.type)) {
    errors.push(`${prefix}: Unknown cost type '${cost.type}'`);
    return errors;
  }

  if (cost.type === "CHOICE") {
    if (insideChoice) {
      errors.push(`${prefix}: CHOICE cost cannot nest inside another CHOICE`);
    }
    const options = (cost as { options?: unknown }).options;
    if (!Array.isArray(options) || options.length < 2) {
      errors.push(`${prefix}: CHOICE cost requires 'options' with at least 2 branches`);
    } else {
      for (let i = 0; i < options.length; i++) {
        const branch = options[i];
        if (!Array.isArray(branch)) {
          errors.push(`${prefix}.options[${i}]: each branch must be an array of costs`);
          continue;
        }
        for (let j = 0; j < branch.length; j++) {
          errors.push(...validateCost(branch[j] as Cost, `${prefix}.options[${i}][${j}]`, true));
        }
      }
    }
    const labels = (cost as { labels?: unknown }).labels;
    if (labels !== undefined) {
      if (!Array.isArray(labels) || !labels.every((l) => typeof l === "string")) {
        errors.push(`${prefix}: 'labels' must be an array of strings`);
      } else if (Array.isArray(options) && labels.length !== options.length) {
        errors.push(`${prefix}: 'labels' length must equal 'options' length`);
      }
    }
  }

  if (
    cost.type === "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE" &&
    (typeof cost.card_name !== "string" || cost.card_name.trim().length === 0)
  ) {
    errors.push(`${prefix}: TRASH_NAMED_CARD_FROM_HAND_OR_STAGE requires a non-empty 'card_name'`);
  }

  return errors;
}

/**
 * OPT-409: `controller` inside a Target.filter is a silent no-op — runtime
 * matchesFilter only enforces it when the caller passes the optional
 * filterController argument, which neither the target-resolver nor
 * effectAppliesToCard (permanent modifiers) does. Walks nested any_of
 * branches recursively.
 */
function validateTargetFilterController(
  filter: TargetFilter | undefined,
  prefix: string,
): string[] {
  const errors: string[] = [];
  const visit = (f: TargetFilter | undefined): void => {
    if (!f) return;
    if (f.controller !== undefined) {
      errors.push(
        `${prefix}: [C5] 'controller' inside target.filter is ignored on targeting paths — use target.controller`,
      );
    }
    for (const sub of f.any_of ?? []) visit(sub);
  };
  visit(filter);
  return errors;
}

function validateTargetFilterShape(filter: unknown, prefix: string): string[] {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    return [`${prefix}: Target filter must be an object`];
  }
  const errors: string[] = [];
  for (const key of Object.keys(filter)) {
    if (!VALID_TARGET_FILTER_FIELDS.has(key)) {
      errors.push(`${prefix}: Unknown target filter field '${key}'`);
    }
  }
  const anyOf = Reflect.get(filter, "any_of");
  if (anyOf !== undefined) {
    if (!Array.isArray(anyOf)) {
      errors.push(`${prefix}.any_of: Must be an array of target filters`);
    } else {
      for (let i = 0; i < anyOf.length; i++) {
        errors.push(...validateTargetFilterShape(anyOf[i], `${prefix}.any_of[${i}]`));
      }
    }
  }
  return errors;
}

function validateTargetFiltersInValue(
  value: unknown,
  prefix: string,
  depth = 0,
): string[] {
  if (!value || typeof value !== "object" || depth > 20) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      validateTargetFiltersInValue(entry, `${prefix}[${index}]`, depth + 1)
    );
  }
  const errors: string[] = [];
  const customTriggerFilter = typeof Reflect.get(value, "event") === "string";
  for (const [key, nested] of Object.entries(value)) {
    const isTargetFilter =
      key === "target_filter" ||
      key === "source_filter" ||
      key === "shared_filter" ||
      (key === "filter" && !customTriggerFilter);
    if (isTargetFilter) {
      errors.push(...validateTargetFilterShape(nested, `${prefix}.${key}`));
    }
    errors.push(
      ...validateTargetFiltersInValue(nested, `${prefix}.${key}`, depth + 1)
    );
  }
  return errors;
}

function validateTriggerShape(trigger: unknown, prefix: string): string[] {
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger)) {
    return [`${prefix}: Trigger must be an object`];
  }
  if ("any_of" in trigger) {
    const anyOf = Reflect.get(trigger, "any_of");
    if (!Array.isArray(anyOf) || anyOf.length === 0) {
      return [`${prefix}.any_of: Must be a non-empty array of triggers`];
    }
    return anyOf.flatMap((entry, index) =>
      validateTriggerShape(entry, `${prefix}.any_of[${index}]`)
    );
  }
  if ("keyword" in trigger) {
    return typeof Reflect.get(trigger, "keyword") === "string"
      ? []
      : [`${prefix}.keyword: Must be a string`];
  }
  if ("event" in trigger) {
    return typeof Reflect.get(trigger, "event") === "string"
      ? []
      : [`${prefix}.event: Must be a string`];
  }
  return [`${prefix}: Trigger must define 'keyword', 'event', or 'any_of'`];
}

function validateTargetController(target: Action["target"], prefix: string): string[] {
  const errors: string[] = [];
  if (target?.type && !VALID_TARGET_TYPES.has(target.type)) {
    errors.push(`${prefix}.target: Unknown target type '${target.type}'`);
  }
  errors.push(...validateTargetFilterController(
    target?.filter as TargetFilter | undefined,
    `${prefix}.target`,
  ));
  const parentController = target?.controller;
  if (parentController !== undefined && !VALID_CONTROLLERS.has(parentController)) {
    errors.push(`${prefix}.target.controller: Invalid controller '${parentController}'`);
  } else if (parentController !== undefined && target?.type) {
    const supportedModes = TARGET_CONTROLLER_MODES[target.type]
      ?? NO_SLOT_CONTROLLERS;
    if (!supportedModes.has(parentController)) {
      const guidance = supportedModes.size === 0
        ? "this target type has fixed scope; remove the controller"
        : `use ${[...supportedModes].join(" or ")}`;
      errors.push(
        `${prefix}.target.controller: [C8] Target type '${target.type}' does not support controller '${parentController}'; ${guidance}`,
      );
    }
  }
  for (let i = 0; i < (target?.dual_targets?.length ?? 0); i++) {
    const slotController = target!.dual_targets![i].controller;
    if (slotController !== undefined && !VALID_CONTROLLERS.has(slotController)) {
      errors.push(
        `${prefix}.dual_targets[${i}].controller: Invalid controller '${slotController}'`,
      );
    } else if (slotController !== undefined && target?.type) {
      const supportedModes = DUAL_TARGET_SLOT_CONTROLLER_MODES[target.type]
        ?? NO_SLOT_CONTROLLERS;
      if (!supportedModes.has(slotController)) {
        const guidance = supportedModes.size === 0
          ? "this target type does not support a per-slot controller; remove the controller"
          : `use ${[...supportedModes].join(" or ")}`;
        errors.push(
          `${prefix}.dual_targets[${i}].controller: [C7] Target type '${target.type}' does not support dual-target slot controller '${slotController}'; ${guidance}`,
        );
      }
    }
    errors.push(...validateTargetFilterController(
      target!.dual_targets![i].filter as TargetFilter | undefined,
      `${prefix}.dual_targets[${i}]`,
    ));
  }
  return errors;
}

function validateAction(action: Action, prefix: string, firstInChain = false): string[] {
  const errors: string[] = [];

  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return [`${prefix}: Action must be an object`];
  }

  for (const key of Object.keys(action)) {
    if (!VALID_ACTION_FIELDS.has(key)) {
      errors.push(`${prefix}: Unknown action field '${key}'`);
    }
  }

  if (!action.type) {
    errors.push(`${prefix}: Missing 'type' field`);
  } else if (!VALID_ACTION_TYPES.has(action.type)) {
    errors.push(`${prefix}: Unknown action type '${action.type}'`);
  } else if (UNHANDLED_ACTION_TYPES.has(action.type)) {
    errors.push(`${prefix}: Action type '${action.type}' has no resolver handler`);
  }
  if (firstInChain && action.chain) {
    errors.push(
      `${prefix}: First action has chain '${action.chain}' (only subsequent actions may declare a connector)`,
    );
  }
  if (action.chain && !["THEN", "IF_DO", "AND"].includes(action.chain)) {
    errors.push(`${prefix}: Unknown chain connector '${action.chain}'`);
  }

  if (action.type === "CHOOSE_VALUE") {
    if (!action.result_ref) {
      errors.push(`${prefix}: CHOOSE_VALUE requires 'result_ref'`);
    }
    const domain = action.params?.domain;
    if (!domain || !["COST", "POWER", "NUMBER"].includes(String(domain))) {
      errors.push(`${prefix}: CHOOSE_VALUE requires domain COST, POWER, or NUMBER`);
    }
    const step = action.params?.step;
    if (step !== undefined && (!Number.isInteger(step) || Number(step) <= 0)) {
      errors.push(`${prefix}: CHOOSE_VALUE step must be a positive integer`);
    }
  }

  // OPT-409: `controller` inside Target.filter is silently ignored on normal
  // targeting paths — matchesFilter only enforces it when the caller passes
  // the optional filterController argument, which the target-resolver never
  // does. Scope the target with Target.controller instead.
  errors.push(...validateTargetController(action.target, prefix));

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
            errors.push(...validateAction(
              options[i][j],
              `${prefix}.params.options[${i}][${j}]`,
              j === 0,
            ));
          }
          errors.push(...validateActionConnectors(
            options[i] as Action[],
            `${prefix}.params.options[${i}]`,
          ));
        }
      }
    }
  }

  // Validate nested action in OPPONENT_ACTION
  if (action.type === "OPPONENT_ACTION" && action.params?.action) {
    errors.push(...validateAction(action.params.action as Action, `${prefix}.params.action`, true));
  }

  // Validate nested action in SCHEDULE_ACTION
  if (action.type === "SCHEDULE_ACTION" && action.params?.action) {
    errors.push(...validateAction(action.params.action as Action, `${prefix}.params.action`, true));
  }

  return errors;
}

function collectConsumedResultRefs(
  value: unknown,
  consumed: Set<string>,
  depth = 0,
): void {
  if (!value || typeof value !== "object" || depth > 12) return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "result_ref") {
      if (
        (value as { type?: unknown }).type === "REVEALED_CARD_PROPERTY" &&
        typeof nested === "string"
      ) {
        consumed.add(nested);
      }
      continue;
    }
    if ((key === "target_ref" || key.endsWith("_ref")) && typeof nested === "string") {
      consumed.add(nested);
    }
    if (
      nested &&
      typeof nested === "object" &&
      ((nested as { type?: unknown }).type === "ACTION_RESULT" ||
        (nested as { type?: unknown }).type === "CHOSEN_VALUE") &&
      typeof (nested as { ref?: unknown }).ref === "string"
    ) {
      consumed.add((nested as { ref: string }).ref);
    }
    collectConsumedResultRefs(nested, consumed, depth + 1);
  }
}

function validateActionConnectors(actions: Action[], prefix: string): string[] {
  const errors: string[] = [];
  for (let i = 1; i < actions.length; i++) {
    if (actions[i]?.chain !== "AND") continue;

    let start = i - 1;
    while (start > 0 && actions[start]?.chain === "AND") start--;
    let end = i;
    while (end + 1 < actions.length && actions[end + 1]?.chain === "AND") end++;
    const group = actions.slice(start, end + 1);

    for (let offset = 0; offset < group.length; offset++) {
      const action = group[offset];
      if (!SIMULTANEOUS_ACTION_TYPES.has(action.type)) {
        errors.push(
          `${prefix}[${start + offset}]: Action type '${action.type}' cannot be used in an AND transaction; use THEN for ordered card text`,
        );
      }
    }

    const producedInsideGroup = new Set(
      group.map((action) => action.result_ref).filter((ref): ref is string => Boolean(ref)),
    );
    for (let offset = 0; offset < group.length; offset++) {
      const action = group[offset];
      const consumedByAction = new Set<string>();
      collectConsumedResultRefs(action, consumedByAction);
      for (const ref of consumedByAction) {
        if (producedInsideGroup.has(ref)) {
          errors.push(
            `${prefix}[${start + offset}]: AND action depends on result_ref '${ref}' produced inside the same simultaneous group`,
          );
        }
      }
    }

    if (actions[end + 1]?.chain === "IF_DO") {
      errors.push(
        `${prefix}[${end + 1}]: IF_DO cannot follow an AND transaction until group-success semantics are defined`,
      );
    }

    i = end;
  }
  return errors;
}

function walkActions(actions: Action[]): Action[] {
  const walked: Action[] = [];
  const visit = (list: Action[]): void => {
    for (const action of list) {
      if (!action || typeof action !== "object") continue;
      walked.push(action);
      visit(getNestedActions(action));
    }
  };
  visit(actions);
  return walked;
}

function validateResultReferences(actions: Action[], prefix: string): string[] {
  const produced = new Set<string>();
  const consumed = new Set<string>();

  for (const action of walkActions(actions)) {
    if (action.result_ref) produced.add(action.result_ref);
    collectConsumedResultRefs(action, consumed);
  }

  const errors: string[] = [];
  for (const ref of produced) {
    if (!consumed.has(ref)) {
      errors.push(`${prefix}: result_ref '${ref}' is never consumed`);
    }
  }
  for (const ref of consumed) {
    if (!produced.has(ref) && !IMPLICIT_COST_RESULT_REFS.has(ref)) {
      errors.push(`${prefix}: target_ref '${ref}' has no matching result_ref`);
    }
  }
  return errors;
}
