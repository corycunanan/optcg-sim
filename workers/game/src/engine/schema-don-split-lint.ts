/**
 * OPT-955 schema-lint rule for the DISTRIBUTE_DON split form.
 *
 * `max_per_target` ("give up to N DON!! to each of") switches the handler to
 * the player-chosen split (BATCH-CONTRACT.md §5), which ignores the fixed
 * forms `amount` / `amount_per_target`. Authoring both, or `max_total`
 * without `max_per_target`, is silently half-read, so this rule rejects it.
 * Both caps must be positive integers.
 */
import type { EffectSchema } from "./effect-types.js";

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function walk(node: unknown, path: string, cardId: string, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, cardId, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const params = record.params as Record<string, unknown> | undefined;
  if (record.type === "DISTRIBUTE_DON" && params && typeof params === "object") {
    const split = "max_per_target" in params;
    if (split && !isPositiveInteger(params.max_per_target)) {
      out.push(`${cardId} ${path}: DISTRIBUTE_DON max_per_target must be a positive integer`);
    }
    if (split && ("amount" in params || "amount_per_target" in params)) {
      out.push(
        `${cardId} ${path}: DISTRIBUTE_DON max_per_target replaces amount/amount_per_target; author one form`,
      );
    }
    if ("max_total" in params) {
      if (!split) out.push(`${cardId} ${path}: DISTRIBUTE_DON max_total is read only with max_per_target`);
      else if (!isPositiveInteger(params.max_total)) {
        out.push(`${cardId} ${path}: DISTRIBUTE_DON max_total must be a positive integer`);
      }
    }
  }
  for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`, cardId, out);
}

export function findDonSplitParamViolations(schemas: Record<string, EffectSchema>): string[] {
  const out: string[] = [];
  for (const [cardId, schema] of Object.entries(schemas)) walk(schema.effects, "effects", cardId, out);
  return out;
}
