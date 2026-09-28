/**
 * OPT-858 schema-lint rules for `DON_GIVEN` comparison fields.
 *
 * `evaluateCondition` (condition-queries.ts) reads `operator`/`value` only in
 * some modes, so a mismatched pairing is silently wrong rather than rejected:
 * - `ANY_CARD_HAS_DON` is boolean ("any DON!! cards given") and ignores
 *   `operator`/`value`. A threshold on it fires at a single given DON!!.
 * - `TOTAL_GIVEN` resolves false when `operator` or `value` is missing.
 *
 * Text rule: canonical "a total of N or more given DON!! cards" must be encoded
 * as `TOTAL_GIVEN` `>= N` somewhere in that card's schema.
 *
 * Kept out of `validateEffectSchema` on purpose: that validator also gates
 * DB-loaded card data at runtime (util/validate.ts), and these are authoring
 * rules, not wire-shape contracts.
 */
import type { EffectSchema } from "./effect-types.js";

interface DonGivenNode {
  path: string;
  mode: unknown;
  operator: unknown;
  value: unknown;
}

function collectDonGiven(node: unknown, path: string, found: DonGivenNode[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectDonGiven(child, `${path}[${index}]`, found));
    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  if (record.type === "DON_GIVEN") {
    found.push({ path, mode: record.mode, operator: record.operator, value: record.value });
  }
  for (const [key, value] of Object.entries(record)) {
    collectDonGiven(value, path ? `${path}.${key}` : key, found);
  }
}

/** Shape violations for one schema's `DON_GIVEN` nodes. */
export function findDonGivenModeViolations(schema: EffectSchema): string[] {
  const found: DonGivenNode[] = [];
  collectDonGiven(schema, "", found);
  const cardId = schema.card_id ?? "UNKNOWN";
  const violations: string[] = [];
  for (const node of found) {
    const hasComparison = node.operator !== undefined || node.value !== undefined;
    if (node.mode === "ANY_CARD_HAS_DON" && hasComparison) {
      violations.push(
        `${cardId} ${node.path}: DON_GIVEN ANY_CARD_HAS_DON ignores operator/value; use TOTAL_GIVEN for "a total of N or more given DON!! cards"`,
      );
    }
    if (node.mode === "TOTAL_GIVEN" && (node.operator === undefined || node.value === undefined)) {
      violations.push(
        `${cardId} ${node.path}: DON_GIVEN TOTAL_GIVEN requires both operator and value`,
      );
    }
  }
  return violations;
}

const TOTAL_GIVEN_TEXT = /total of (\d+) or more given DON!!/g;

/** Canonical "total of N or more given DON!!" requires a TOTAL_GIVEN >= N node. */
export function findTotalGivenTextViolations(
  cardId: string,
  text: string,
  schema: EffectSchema,
): string[] {
  const thresholds = new Set(
    [...text.matchAll(TOTAL_GIVEN_TEXT)].map((match) => Number(match[1])),
  );
  if (thresholds.size === 0) return [];
  const found: DonGivenNode[] = [];
  collectDonGiven(schema, "", found);
  return [...thresholds]
    .filter(
      (threshold) =>
        !found.some(
          (node) =>
            node.mode === "TOTAL_GIVEN" &&
            node.operator === ">=" &&
            node.value === threshold,
        ),
    )
    .map(
      (threshold) =>
        `${cardId}: canonical "a total of ${threshold} or more given DON!! cards" requires DON_GIVEN TOTAL_GIVEN >= ${threshold}`,
    );
}

export function findDonGivenIntentViolations(
  canonicalBlocks: readonly { cardId: string; text: string }[],
  schemas: Record<string, EffectSchema>,
): string[] {
  return [
    ...Object.values(schemas).flatMap(findDonGivenModeViolations),
    ...canonicalBlocks.flatMap(({ cardId, text }) => {
      const schema = schemas[cardId];
      return schema ? findTotalGivenTextViolations(cardId, text, schema) : [];
    }),
  ];
}
