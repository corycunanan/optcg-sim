/**
 * OPT-798 schema-lint rule: printed "trash N cards from the top of your
 * deck:" before an effect's colon is an activation cost (rule 8-3-1), so it
 * must be authored as a `MILL` cost — never as a first `MILL` action (which
 * resolves even when the deck cannot pay) and never as another cost type.
 *
 * Driven from canonical card text (docs/cards), not from schema shape, so a
 * card encoded without any MILL at all is still caught.
 */
import type { Cost, EffectSchema } from "./effect-types.js";

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const DECK_TRASH = /\btrash (\d+|a|an|one|two|three|four|five) cards? from the top of your deck\b/gi;

/**
 * Cards whose canonical text has a pre-colon deck trash but whose schema is
 * not yet re-encoded. Each entry is a tracked follow-up; the lint reports an
 * entry that no longer violates so the deferral cannot go stale.
 */
export const MILL_COST_ENCODING_DEFERRALS: ReadonlySet<string> = new Set([
  // OP11-098 Blue Hole: MILL-first action encoding (OPT-798 follow-up).
  "OP11-098",
  // OP12-090 Belo Betty: encoded as TRASH_FROM_HAND ×2 (OPT-798 follow-up).
  "OP12-090",
]);

function toAmount(token: string): number {
  return /^\d+$/.test(token) ? Number(token) : WORD_NUMBERS[token.toLowerCase()] ?? 1;
}

/** Amounts of every printed "trash N cards from the top of your deck" that sits before a colon. */
export function preColonMillAmounts(cardText: string): number[] {
  const amounts: number[] = [];
  const lines = cardText.replace(/<br\s*\/?\s*>/gi, "\n").split("\n");
  for (const line of lines) {
    // Keyword brackets such as [Activate: Main] carry their own colon.
    const unbracketed = line.replace(/\[[^\]]*\]/g, " ");
    for (const sentence of unbracketed.split(/(?<=\.)\s+/)) {
      const colon = sentence.indexOf(":");
      if (colon < 0) continue;
      for (const match of sentence.slice(0, colon).matchAll(DECK_TRASH)) {
        amounts.push(toAmount(match[1]));
      }
    }
  }
  return amounts;
}

function millCostAmounts(costs: readonly Cost[] | undefined): number[] {
  return (costs ?? []).flatMap((cost): number[] => {
    if (cost.type === "CHOICE") return cost.options.flatMap((branch) => millCostAmounts(branch));
    if (cost.type === "CHOOSE_ONE_COST") return millCostAmounts(cost.options);
    if (cost.type !== "MILL") return [];
    return [typeof cost.amount === "number" ? cost.amount : Number.NaN];
  });
}

/** Violations for one card: canonical text block + its authored schema. */
export function findMillCostViolations(cardText: string, schema: EffectSchema): string[] {
  const printed = preColonMillAmounts(cardText);
  const authored = schema.effects.flatMap((block) => millCostAmounts(block.costs));
  const violations: string[] = [];

  for (const block of schema.effects) {
    const first = block.actions?.[0];
    if (first?.type !== "MILL" || millCostAmounts(block.costs).length > 0) continue;
    const amount = (first.params as { amount?: unknown } | undefined)?.amount;
    if (typeof amount === "number" && printed.includes(amount)) {
      violations.push(
        `${schema.card_id} ${block.id}: printed "trash ${amount} cards from the top of your deck:" is an activation cost but is encoded as the first action — use costs: [{ type: "MILL", amount: ${amount} }]`,
      );
    }
  }

  const unmatched = [...authored];
  for (const amount of printed) {
    const index = unmatched.indexOf(amount);
    if (index >= 0) {
      unmatched.splice(index, 1);
      continue;
    }
    violations.push(
      `${schema.card_id}: printed "trash ${amount} cards from the top of your deck:" requires a MILL cost with amount ${amount}`,
    );
  }
  for (const amount of unmatched) {
    violations.push(
      `${schema.card_id}: MILL cost (amount ${amount}) has no printed pre-colon "trash N cards from the top of your deck:"`,
    );
  }
  return violations;
}

/**
 * Apply the tracked deferrals across every canonical card block. Returns the
 * violations of non-deferred cards plus any deferral that no longer violates.
 */
export function findMillCostIntentViolations(
  cards: ReadonlyArray<{ cardId: string; text: string }>,
  schemas: Readonly<Record<string, EffectSchema>>,
  deferrals: ReadonlySet<string> = MILL_COST_ENCODING_DEFERRALS,
): string[] {
  const violations: string[] = [];
  const deferredStillViolating = new Set<string>();
  for (const { cardId, text } of cards) {
    const schema = schemas[cardId];
    if (!schema) continue;
    const found = findMillCostViolations(text, schema);
    if (found.length === 0) continue;
    if (deferrals.has(cardId)) deferredStillViolating.add(cardId);
    else violations.push(...found);
  }
  for (const cardId of deferrals) {
    if (schemas[cardId] && !deferredStillViolating.has(cardId)) {
      violations.push(
        `${cardId}: listed in MILL_COST_ENCODING_DEFERRALS but no longer violates the MILL cost rule — remove the deferral`,
      );
    }
  }
  return violations;
}
