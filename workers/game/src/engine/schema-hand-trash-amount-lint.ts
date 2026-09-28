/**
 * OPT-793 schema-lint rule: a TRASH_FROM_HAND whose `amount` is the live hand
 * size (`GAME_STATE` / `HAND_COUNT`) trashes the entire hand.
 *
 * That shape is how "trash cards from your hand until you have N" was once
 * mis-encoded (OP05-058 trashed both whole hands instead of trimming to 5);
 * the correct encoding is `params.until_count: N`. It is also the correct
 * encoding for printed text that really trashes the whole hand, so the rule
 * does not outlaw it: each legitimate use is a reviewed disposition naming the
 * card, the clause path, and the printed words that justify it. The lint
 * verifies the printed words against canonical card text when that text is
 * supplied, and reports a disposition that no longer matches any clause so
 * the list cannot go stale. A free-text `_comment` is never a bypass.
 *
 * Also rejects `until_count` combined with `amount` on the same action — the
 * handler reads only `until_count`, so an `amount` there is dead and
 * misleading.
 *
 * Driven by schema shape over the authored registry, including nested actions
 * (OPPONENT_ACTION wrappers, choice options, scheduled and granted actions).
 */
import type { EffectSchema } from "./effect-types.js";

export interface WholeHandTrashDisposition {
  /** Path of the TRASH_FROM_HAND action inside the schema, from `effects`. */
  path: string;
  /** Printed words (case-insensitive substring of canonical text) that trash the whole hand. */
  printed: string;
}

/** Reviewed card/clause dispositions for genuine whole-hand trashes. */
export const WHOLE_HAND_TRASH_DISPOSITIONS: Readonly<Record<string, readonly WholeHandTrashDisposition[]>> = {
  // OP14-048 Jinbe — "[On Play] Return up to 1 of your opponent's Characters
  // to the owner's hand. Then, trash all cards from your hand."
  "OP14-048": [{ path: "effects[0].actions[1]", printed: "trash all cards from your hand" }],
};

interface Found {
  path: string;
  wholeHand: boolean;
  untilWithAmount: boolean;
}

function isHandCountAmount(amount: unknown): boolean {
  if (!amount || typeof amount !== "object") return false;
  const record = amount as Record<string, unknown>;
  return record.type === "GAME_STATE" && record.source === "HAND_COUNT";
}

function collect(node: unknown, path: string, found: Found[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child, `${path}[${index}]`, found));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (record.type === "TRASH_FROM_HAND" && record.params && typeof record.params === "object") {
    const params = record.params as Record<string, unknown>;
    const wholeHand = isHandCountAmount(params.amount);
    const untilWithAmount = params.until_count !== undefined && params.amount !== undefined;
    if (wholeHand || untilWithAmount) found.push({ path, wholeHand, untilWithAmount });
  }
  for (const [key, value] of Object.entries(record)) {
    collect(value, `${path}.${key}`, found);
  }
}

function normalize(text: string): string {
  return text.replace(/<br\s*\/?\s*>/gi, " ").replace(/\s+/g, " ").toLowerCase();
}

/**
 * Violations for one schema. `cardText`, when given, must contain each
 * matching disposition's printed words.
 */
export function findWholeHandTrashViolations(
  schema: EffectSchema,
  cardText?: string,
  dispositions: Readonly<Record<string, readonly WholeHandTrashDisposition[]>> = WHOLE_HAND_TRASH_DISPOSITIONS,
): string[] {
  const cardId = schema.card_id ?? "UNKNOWN";
  const found: Found[] = [];
  collect(schema.effects, "effects", found);
  const allowed = dispositions[cardId] ?? [];
  const violations: string[] = [];
  for (const entry of found) {
    if (entry.untilWithAmount) {
      violations.push(
        `${cardId} ${entry.path}: TRASH_FROM_HAND sets both until_count and amount — until_count replaces amount; remove amount`,
      );
    }
    if (!entry.wholeHand) continue;
    const disposition = allowed.find((d) => d.path === entry.path);
    if (!disposition) {
      violations.push(
        `${cardId} ${entry.path}: TRASH_FROM_HAND amount GAME_STATE HAND_COUNT trashes the whole hand — ` +
          `"until you have N" is params.until_count: N; a printed whole-hand trash needs a reviewed ` +
          `WHOLE_HAND_TRASH_DISPOSITIONS entry (schema-hand-trash-amount-lint.ts)`,
      );
      continue;
    }
    if (cardText !== undefined && !normalize(cardText).includes(normalize(disposition.printed))) {
      violations.push(
        `${cardId} ${entry.path}: WHOLE_HAND_TRASH_DISPOSITIONS printed clause "${disposition.printed}" is not in the canonical card text`,
      );
    }
  }
  for (const disposition of allowed) {
    if (!found.some((entry) => entry.wholeHand && entry.path === disposition.path)) {
      violations.push(
        `${cardId} ${disposition.path}: listed in WHOLE_HAND_TRASH_DISPOSITIONS but no whole-hand TRASH_FROM_HAND is authored there — update or remove the disposition`,
      );
    }
  }
  return violations;
}

export function findWholeHandTrashIntentViolations(
  schemas: Readonly<Record<string, EffectSchema>>,
  cards: ReadonlyArray<{ cardId: string; text: string }> = [],
  dispositions: Readonly<Record<string, readonly WholeHandTrashDisposition[]>> = WHOLE_HAND_TRASH_DISPOSITIONS,
  options: { requireEveryDisposition?: boolean } = {},
): string[] {
  const texts = new Map(cards.map((card) => [card.cardId, card.text]));
  const violations = Object.entries(schemas).flatMap(([cardId, schema]) =>
    findWholeHandTrashViolations({ ...schema, card_id: cardId }, texts.get(cardId), dispositions),
  );
  for (const cardId of Object.keys(dispositions)) {
    if (options.requireEveryDisposition !== false && !schemas[cardId]) {
      violations.push(`${cardId}: listed in WHOLE_HAND_TRASH_DISPOSITIONS but has no authored schema — remove the disposition`);
    }
  }
  return violations;
}
