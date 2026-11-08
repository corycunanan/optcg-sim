/**
 * OPT-882 schema-lint rule for `exclude_self` inside conditions.
 *
 * "Other than this card" has one spelling per consumer:
 * - Targets, costs, replacement target filters and permanent modifier targets
 *   read `filter.exclude_self` (the source is known where they filter).
 * - Conditions read the condition-level `exclude_self`, and only CARD_ON_FIELD
 *   reads it (condition-queries.ts). `matchesFilter` never receives the
 *   source card, so a `filter.exclude_self` inside a condition is silently
 *   ignored: "no other [X]" gates counted the source and could never pass
 *   (EB01-012, OP07-060), and "if you have another [X]" gates passed on the
 *   source alone (OP04-005).
 *
 * This rule makes both ignored forms unauthorable: `exclude_self` inside a
 * condition's filter, and condition-level `exclude_self` on a condition type
 * other than CARD_ON_FIELD.
 */
import type { EffectSchema } from "./effect-types.js";

/** Schema keys whose value is a Condition (or a list of them). */
const CONDITION_KEYS = new Set(["conditions", "post_cost_conditions", "option_conditions", "condition"]);

/** Condition types whose evaluator honors the condition-level `exclude_self`. */
export const CONDITION_EXCLUDE_SELF_TYPES: ReadonlySet<string> = new Set(["CARD_ON_FIELD"]);

function checkCondition(node: unknown, path: string, cardId: string, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => checkCondition(child, `${path}[${index}]`, cardId, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.all_of)) checkCondition(record.all_of, `${path}.all_of`, cardId, out);
  if (Array.isArray(record.any_of)) checkCondition(record.any_of, `${path}.any_of`, cardId, out);
  if (record.not && typeof record.not === "object") checkCondition(record.not, `${path}.not`, cardId, out);

  const filter = record.filter as Record<string, unknown> | undefined;
  if (filter && typeof filter === "object" && "exclude_self" in filter) {
    out.push(
      `${cardId} ${path}: conditions ignore filter.exclude_self; put exclude_self on the ${String(record.type ?? "condition")} condition itself`,
    );
  }
  if ("exclude_self" in record && typeof record.type === "string" && !CONDITION_EXCLUDE_SELF_TYPES.has(record.type)) {
    out.push(
      `${cardId} ${path}: ${record.type} ignores exclude_self; only ${[...CONDITION_EXCLUDE_SELF_TYPES].join(", ")} reads it`,
    );
  }
  // A condition can carry nested conditions of its own (e.g. a duration).
  for (const [key, value] of Object.entries(record)) {
    if (key === "all_of" || key === "any_of" || key === "not") continue;
    const childPath = `${path}.${key}`;
    if (CONDITION_KEYS.has(key)) checkCondition(value, childPath, cardId, out);
    else walk(value, childPath, cardId, out);
  }
}

function walk(node: unknown, path: string, cardId: string, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, cardId, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (CONDITION_KEYS.has(key)) checkCondition(value, childPath, cardId, out);
    else walk(value, childPath, cardId, out);
  }
}

/** Ignored `exclude_self` encodings inside one schema's conditions. */
export function findConditionExcludeSelfViolations(schema: EffectSchema): string[] {
  const out: string[] = [];
  walk(schema, "", schema.card_id ?? "UNKNOWN", out);
  return out;
}

export function findConditionExcludeSelfIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findConditionExcludeSelfViolations);
}
