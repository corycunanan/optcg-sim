/**
 * OPT-798 schema-lint rule: printed "trash N cards from the top of your
 * deck:" before an effect's colon is an activation cost (rule 8-3-1), so it
 * must be authored as a `MILL` cost — never as a first `MILL` action (which
 * resolves even when the deck cannot pay) and never as another cost type.
 *
 * Driven from canonical card text (docs/cards), not from schema shape, so a
 * card encoded without any MILL at all is still caught.
 */
import type { Cost, EffectBlock, EffectSchema, KeywordTriggerType, Trigger } from "./effect-types.js";

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const DECK_TRASH = /\btrash (\d+|a|an|one|two|three|four|five) cards? from the top of your deck\b/gi;

/**
 * Cards whose canonical text has a pre-colon deck trash but whose schema is
 * not yet re-encoded. Each entry is a tracked follow-up; the lint reports an
 * entry that no longer violates so the deferral cannot go stale.
 */
export const MILL_COST_ENCODING_DEFERRALS: ReadonlySet<string> = new Set<string>();

function toAmount(token: string): number {
  return /^\d+$/.test(token) ? Number(token) : WORD_NUMBERS[token.toLowerCase()] ?? 1;
}

/**
 * Printed timing brackets → authored trigger keywords. A clause is associated
 * with the blocks whose trigger carries one of these keywords.
 */
const TIMING_KEYWORDS: Record<string, readonly KeywordTriggerType[]> = {
  "main": ["MAIN_EVENT"],
  "activate: main": ["ACTIVATE_MAIN"],
  "on play": ["ON_PLAY"],
  "when attacking": ["WHEN_ATTACKING"],
  "on k.o.": ["ON_KO"],
  "on block": ["ON_BLOCK"],
  "on your opponent's attack": ["ON_OPPONENT_ATTACK"],
  "end of your turn": ["END_OF_YOUR_TURN"],
  "end of your opponent's turn": ["END_OF_OPPONENT_TURN"],
  "counter": ["COUNTER", "COUNTER_EVENT"],
  "trigger": ["TRIGGER"],
};

/** One printed pre-colon "trash N cards from the top of your deck". */
export interface PreColonMillClause {
  amount: number;
  /**
   * Trigger keywords of the printed timing on the clause's line, or null when
   * the line carries no recognized timing bracket (e.g. an event-driven
   * "When ..." sentence). Null clauses fall back to card-wide matching.
   */
  keywords: readonly KeywordTriggerType[] | null;
}

/** Every printed pre-colon deck trash, with the timing it belongs to. */
export function preColonMillClauses(cardText: string): PreColonMillClause[] {
  const clauses: PreColonMillClause[] = [];
  const lines = cardText.replace(/<br\s*\/?\s*>/gi, "\n").split("\n");
  for (const line of lines) {
    // Timing brackets with their offsets; a clause takes the last one that
    // precedes its own colon, so brackets after the colon (e.g. "a card with
    // a [Trigger]") never re-time it.
    const timings: { index: number; keywords: readonly KeywordTriggerType[] }[] = [];
    for (const bracket of line.matchAll(/\[([^\]]*)\]/g)) {
      const mapped = TIMING_KEYWORDS[bracket[1].trim().toLowerCase()];
      if (mapped) timings.push({ index: bracket.index, keywords: mapped });
    }
    // Keyword brackets such as [Activate: Main] carry their own colon; mask
    // them with spaces of equal length so offsets stay aligned with the line.
    const masked = line.replace(/\[[^\]]*\]/g, (m) => " ".repeat(m.length));
    let start = 0;
    for (const boundary of [...masked.matchAll(/(?<=\.)\s+/g), null]) {
      const end = boundary ? boundary.index : masked.length;
      const sentence = masked.slice(start, end);
      const colon = sentence.indexOf(":");
      if (colon >= 0) {
        const colonIndex = start + colon;
        const keywords = timings.filter((t) => t.index < colonIndex).at(-1)?.keywords ?? null;
        for (const match of sentence.slice(0, colon).matchAll(DECK_TRASH)) {
          clauses.push({ amount: toAmount(match[1]), keywords });
        }
      }
      if (boundary) start = boundary.index + boundary[0].length;
    }
  }
  return clauses;
}

/** Amounts of every printed pre-colon deck trash. */
export function preColonMillAmounts(cardText: string): number[] {
  return preColonMillClauses(cardText).map((clause) => clause.amount);
}

function millCostAmounts(costs: readonly Cost[] | undefined): number[] {
  return (costs ?? []).flatMap((cost): number[] => {
    if (cost.type === "CHOICE") return cost.options.flatMap((branch) => millCostAmounts(branch));
    if (cost.type === "CHOOSE_ONE_COST") return millCostAmounts(cost.options);
    if (cost.type !== "MILL") return [];
    return [typeof cost.amount === "number" ? cost.amount : Number.NaN];
  });
}

function triggerKeywords(trigger: Trigger | undefined): KeywordTriggerType[] {
  if (!trigger) return [];
  if ("any_of" in trigger) return trigger.any_of.flatMap(triggerKeywords);
  return "keyword" in trigger ? [trigger.keyword] : [];
}

function clauseMatchesBlock(clause: PreColonMillClause, block: EffectBlock): boolean {
  if (clause.keywords === null) return true;
  const blockKeywords = triggerKeywords(block.trigger);
  return clause.keywords.some((keyword) => blockKeywords.includes(keyword));
}

/**
 * Violations for one card: canonical text block + its authored schema.
 *
 * Each printed clause is matched only against blocks with the same timing
 * (the bracket on its line vs `block.trigger`). A clause whose line has no
 * recognized timing bracket falls back to matching any block of the card.
 */
export function findMillCostViolations(cardText: string, schema: EffectSchema): string[] {
  const clauses = preColonMillClauses(cardText);
  const violations: string[] = [];
  // Unconsumed MILL costs per block, consumed as clauses find a payment.
  const unmatched = new Map<EffectBlock, number[]>(
    schema.effects.map((block) => [block, millCostAmounts(block.costs)]),
  );

  for (const block of schema.effects) {
    const first = block.actions?.[0];
    if (first?.type !== "MILL" || millCostAmounts(block.costs).length > 0) continue;
    const amount = (first.params as { amount?: unknown } | undefined)?.amount;
    if (
      typeof amount === "number" &&
      clauses.some((clause) => clause.amount === amount && clauseMatchesBlock(clause, block))
    ) {
      violations.push(
        `${schema.card_id} ${block.id}: printed "trash ${amount} cards from the top of your deck:" is an activation cost but is encoded as the first action — use costs: [{ type: "MILL", amount: ${amount} }]`,
      );
    }
  }

  // Timed clauses first so an untimed (card-wide) clause cannot take the
  // only cost a timed clause could use.
  const ordered = [...clauses].sort((a, b) => Number(a.keywords === null) - Number(b.keywords === null));
  for (const clause of ordered) {
    const payer = schema.effects.find((block) =>
      clauseMatchesBlock(clause, block) && unmatched.get(block)!.includes(clause.amount),
    );
    if (payer) {
      const amounts = unmatched.get(payer)!;
      amounts.splice(amounts.indexOf(clause.amount), 1);
      continue;
    }
    violations.push(
      `${schema.card_id}: printed "trash ${clause.amount} cards from the top of your deck:" requires a MILL cost with amount ${clause.amount}` +
        (clause.keywords ? ` on its ${clause.keywords.join("/")} block` : ""),
    );
  }
  for (const [block, amounts] of unmatched) {
    for (const amount of amounts) {
      violations.push(
        `${schema.card_id} ${block.id}: MILL cost (amount ${amount}) has no printed pre-colon "trash N cards from the top of your deck:" with this block's timing`,
      );
    }
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
