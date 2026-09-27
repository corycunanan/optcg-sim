/**
 * OPT-800 schema-lint rule: every replacement `replaces.target_filter` names
 * its `controller`.
 *
 * `registerReplacementsForCard` (triggers.ts) registers a replacement that has
 * a `target_filter` as a wildcard (`appliesTo = []`) and leaves target
 * selection to the filter at check time (`replacementMatchesTarget` in
 * replacements.ts). A filter without `controller` matches both players' cards,
 * so "If your Character would be K.O.'d…" silently protects the opponent's
 * Characters too. Printed text decides the scope (rules §1-3-1 allows cards to
 * say otherwise), so the author must state it: SELF, OPPONENT, EITHER or ANY.
 *
 * Self-only exemption: a replacement with no `target_filter` registers with
 * `appliesTo = [source instance]` and can only protect its own source ("this
 * Character"/"this card"). It is exempt by construction.
 *
 * Driven by schema shape only: every object whose `replaces` is an object
 * carrying a `target_filter` is checked, including replacement blocks nested
 * inside other blocks or actions (granted effects).
 */
import type { EffectSchema } from "./effect-types.js";

function collectViolations(node: unknown, path: string, found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectViolations(child, `${path}[${index}]`, found));
    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const replaces = record.replaces;
  if (replaces && typeof replaces === "object" && !Array.isArray(replaces)) {
    const filter = (replaces as Record<string, unknown>).target_filter;
    if (filter && typeof filter === "object" && (filter as Record<string, unknown>).controller === undefined) {
      const id = typeof record.id === "string" && record.id.length > 0 ? record.id : path;
      found.push(id);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    collectViolations(value, path ? `${path}.${key}` : key, found);
  }
}

/** Violations for one schema: each replacement whose target_filter omits `controller`. */
export function findReplacementControllerViolations(schema: EffectSchema): string[] {
  const found: string[] = [];
  collectViolations(schema, "", found);
  const cardId = schema.card_id ?? "UNKNOWN";
  return found.map(
    (blockId) =>
      `${cardId} ${blockId}: replacement replaces.target_filter must declare controller (SELF/OPPONENT/EITHER/ANY) from printed text; omit target_filter for a self-only ("this Character") replacement`,
  );
}

export function findReplacementControllerIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findReplacementControllerViolations);
}
