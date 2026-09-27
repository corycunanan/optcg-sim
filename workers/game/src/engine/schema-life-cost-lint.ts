/**
 * OPT-857 schema-lint rule: a LIFE_TO_HAND cost is the last cost of every
 * payment sequence it can appear in.
 *
 * A Life-to-hand cost is the only cost a Life replacement (ST13-003) can
 * replace, and `finishReplacedLifeCost` is terminal: it publishes the paid
 * events and drains waiting auto effects without paying any later cost. That
 * is correct only while nothing follows the Life cost, which holds for every
 * authored card today. This rule makes that inventory assumption enforced
 * rather than remembered; a card that needs a later cost must first teach the
 * replaced path to continue (or refuse) the remaining payment.
 *
 * Driven by schema shape: CHOICE / CHOOSE_ONE_COST branches are expanded into
 * every concrete payment order, and nested blocks (granted effects) are
 * included.
 */
import type { Cost, EffectSchema } from "./effect-types.js";

function paymentSequences(costs: readonly Cost[]): Cost[][] {
  let sequences: Cost[][] = [[]];
  for (const cost of costs) {
    if (cost.type === "CHOICE") {
      sequences = sequences.flatMap((prefix) =>
        cost.options.flatMap((branch) =>
          paymentSequences(branch).map((tail) => [...prefix, ...tail]),
        ),
      );
    } else if (cost.type === "CHOOSE_ONE_COST") {
      sequences = sequences.flatMap((prefix) =>
        (cost.options ?? []).flatMap((option) =>
          paymentSequences([option]).map((tail) => [...prefix, ...tail]),
        ),
      );
    } else {
      sequences = sequences.map((prefix) => [...prefix, cost]);
    }
  }
  return sequences;
}

function costBlocks(
  node: unknown,
  found: { id?: unknown; costs: Cost[] }[] = [],
): { id?: unknown; costs: Cost[] }[] {
  if (Array.isArray(node)) {
    for (const child of node) costBlocks(child, found);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.costs) && record.costs.length > 0) {
      found.push({ id: record.id, costs: record.costs as Cost[] });
    }
    for (const [key, value] of Object.entries(record)) {
      if (key !== "costs") costBlocks(value, found);
    }
  }
  return found;
}

/** Violations for one schema: every block where a LIFE_TO_HAND cost is followed by another cost. */
export function findLifeCostOrderViolations(schema: EffectSchema): string[] {
  const violations: string[] = [];
  for (const block of costBlocks(schema.effects)) {
    const misplaced = paymentSequences(block.costs).find((sequence) =>
      sequence.some(
        (cost, index) =>
          cost.type === "LIFE_TO_HAND" && index !== sequence.length - 1,
      ),
    );
    if (!misplaced) continue;
    violations.push(
      `${schema.card_id} ${String(block.id ?? "(unnamed block)")}: LIFE_TO_HAND must be the last cost ` +
        `(found ${misplaced.map((cost) => cost.type).join(" → ")}); a replaced Life cost ` +
        `(finishReplacedLifeCost) never pays later costs — extend that path before authoring this order`,
    );
  }
  return violations;
}

export function findLifeCostOrderIntentViolations(
  schemas: Readonly<Record<string, EffectSchema>>,
): string[] {
  return Object.values(schemas).flatMap(findLifeCostOrderViolations);
}
