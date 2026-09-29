/**
 * OPT-885 schema-lint rule: every `*_THIS_WAY` PER_COUNT source must be
 * fillable by something that precedes it in the same effect block.
 *
 * Convention (dynamic-values.ts `THIS_WAY_TO_COST_REF`):
 * - With `ref`: the count is the `result` of an earlier action in the same
 *   block that declares that `result_ref`. The producing action's type must
 *   be one whose result counts the matching kind of moved card.
 * - Without `ref`: the count is read from the implicit cost ref, so the block
 *   must have a cost whose payment fills that ref.
 *
 * A `*_THIS_WAY` source outside a block's `actions`/`replacement_actions`
 * (block conditions, permanent modifiers, …) has nothing to count and is
 * rejected. OP15-002 Lucy shipped with a TRASH_FROM_HAND *action* feeding a
 * ref-less CARDS_TRASHED_THIS_WAY, which read the never-filled cost ref and
 * always resolved +0.
 *
 * Driven by schema structure only. Each nested effect block (granted effects)
 * is its own scope.
 */
import {
  getNestedActions,
  type Action,
  type EffectSchema,
} from "./effect-types.js";

type ThisWaySource =
  | "CARDS_TRASHED_THIS_WAY"
  | "DON_RESTED_THIS_WAY"
  | "CHARACTERS_RETURNED_THIS_WAY"
  | "CHARACTERS_KO_THIS_WAY"
  | "CARDS_PLACED_TO_DECK_THIS_WAY";

/**
 * Cost types whose payment fills each implicit cost ref
 * (cost/payment.ts, cost/orchestrator.ts, resume/cost.ts).
 */
export const THIS_WAY_COST_FILLERS: Record<ThisWaySource, readonly string[]> = {
  DON_RESTED_THIS_WAY: ["DON_REST", "REST_DON"],
  CARDS_TRASHED_THIS_WAY: [
    "TRASH_FROM_HAND",
    "TRASH_SELF",
    "TRASH_OWN_STAGE",
    "TRASH_OWN_CHARACTER",
    "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE",
    "TRASH_FROM_LIFE",
    "MILL",
  ],
  CHARACTERS_RETURNED_THIS_WAY: [
    "RETURN_OWN_CHARACTER_TO_HAND",
    "PLACE_OWN_CHARACTER_TO_DECK",
  ],
  CHARACTERS_KO_THIS_WAY: ["KO_OWN_CHARACTER"],
  CARDS_PLACED_TO_DECK_THIS_WAY: [
    "PLACE_FROM_TRASH_TO_DECK",
    "PLACE_SELF_TO_DECK",
    "PLACE_SELF_AND_TRASH_TO_DECK",
    "PLACE_SELF_AND_HAND_TO_DECK",
  ],
};

/**
 * Action types whose `result.count` is the number of cards actually moved of
 * the kind each source counts (effect-resolver/actions/removal.ts). Extend
 * only after verifying the handler's result counts moved cards.
 */
export const THIS_WAY_ACTION_PRODUCERS: Record<ThisWaySource, readonly string[]> = {
  DON_RESTED_THIS_WAY: [],
  CARDS_TRASHED_THIS_WAY: ["TRASH_FROM_HAND", "TRASH_CARD"],
  CHARACTERS_RETURNED_THIS_WAY: ["RETURN_TO_HAND"],
  CHARACTERS_KO_THIS_WAY: ["KO"],
  CARDS_PLACED_TO_DECK_THIS_WAY: ["RETURN_TO_DECK"],
};

function isThisWaySource(source: unknown): source is ThisWaySource {
  return typeof source === "string" &&
    Object.prototype.hasOwnProperty.call(THIS_WAY_COST_FILLERS, source);
}

function isEffectBlock(record: Record<string, unknown>): boolean {
  return typeof record.category === "string" &&
    ("actions" in record || "replacement_actions" in record || "trigger" in record);
}

function collectCostTypes(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => collectCostTypes(child, found));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (typeof record.type === "string") found.add(record.type);
  for (const value of Object.values(record)) collectCostTypes(value, found);
}

interface Scope {
  costTypes: ReadonlySet<string>;
  /** result_ref → producing action type, for actions already passed. */
  produced: ReadonlyMap<string, string>;
  /** false outside actions/replacement_actions. */
  inActions: boolean;
}

function checkPerCount(
  record: Record<string, unknown>,
  path: string,
  scope: Scope,
  found: string[],
): void {
  const source = record.source;
  if (record.type !== "PER_COUNT" || !isThisWaySource(source)) return;
  if (!scope.inActions) {
    found.push(`${path}: ${source} outside actions has no cost or action to count`);
    return;
  }
  const ref = record.ref;
  if (typeof ref === "string") {
    const producer = scope.produced.get(ref);
    if (producer === undefined) {
      found.push(`${path}: ${source} ref '${ref}' is not the result_ref of an earlier action in this block`);
    } else if (!THIS_WAY_ACTION_PRODUCERS[source].includes(producer)) {
      found.push(`${path}: ${source} ref '${ref}' comes from ${producer}, which does not count ${source}; allowed: ${THIS_WAY_ACTION_PRODUCERS[source].join(", ") || "none"}`);
    }
    return;
  }
  const fillers = THIS_WAY_COST_FILLERS[source];
  if (!fillers.some((type) => scope.costTypes.has(type))) {
    found.push(`${path}: ${source} without 'ref' reads a cost count, but this block has no ${fillers.join("/")} cost; set result_ref on the counted action and ref here`);
  }
}

function walk(
  node: unknown,
  path: string,
  scope: Scope,
  found: string[],
  skip: ReadonlySet<unknown> = new Set(),
): void {
  if (skip.has(node)) return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, scope, found, skip));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (isEffectBlock(record)) {
    walkBlock(record, path, found);
    return;
  }
  checkPerCount(record, path, scope, found);
  for (const [key, value] of Object.entries(record)) {
    walk(value, `${path}.${key}`, scope, found, skip);
  }
}

function walkActionList(
  actions: unknown,
  path: string,
  costTypes: ReadonlySet<string>,
  found: string[],
): void {
  if (!Array.isArray(actions)) return;
  const produced = new Map<string, string>();
  // Pre-order: an action is checked before its nested actions, and a nested
  // action sees the refs of everything visited before it.
  const visit = (list: Action[], listPath: string): void => {
    list.forEach((action, index) => {
      if (!action || typeof action !== "object") return;
      const actionPath = `${listPath}[${index}]`;
      const nested = getNestedActions(action);
      walk(
        action,
        actionPath,
        { costTypes, produced, inActions: true },
        found,
        new Set<unknown>(nested),
      );
      if (typeof action.result_ref === "string") {
        produced.set(action.result_ref, action.type);
      }
      visit(nested, `${actionPath}.nested`);
    });
  };
  visit(actions as Action[], path);
}

function walkBlock(block: Record<string, unknown>, path: string, found: string[]): void {
  const costTypes = new Set<string>();
  collectCostTypes(block.costs, costTypes);
  const outside: Scope = { costTypes, produced: new Map(), inActions: false };
  for (const [key, value] of Object.entries(block)) {
    const childPath = `${path}.${key}`;
    if (key === "actions" || key === "replacement_actions") {
      walkActionList(value, childPath, costTypes, found);
    } else if (key !== "costs") {
      walk(value, childPath, outside, found);
    }
  }
}

/** Violations for one schema: each `*_THIS_WAY` source nothing can fill. */
export function findThisWaySourceViolations(schema: EffectSchema): string[] {
  const found: string[] = [];
  const cardId = schema.card_id ?? "UNKNOWN";
  const outside: Scope = { costTypes: new Set(), produced: new Map(), inActions: false };
  walk(schema.effects, `${cardId} effects`, outside, found);
  walk(schema.rule_modifications, `${cardId} rule_modifications`, outside, found);
  return found;
}

export function findThisWaySourceIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findThisWaySourceViolations);
}
