/**
 * OPT-894 schema-lint rule: a `COUNTER_EVENT` trigger must sit on a block
 * category the Counter Event consumer actually executes.
 *
 * `executeUseCounterEvent` (battle.ts) selects its block with
 * `category === "auto" && trigger.keyword === "COUNTER_EVENT"`. A Counter
 * Event authored as `activate` pays its cost and goes to the trash but never
 * resolves its [Counter] effect (trigger registration cannot catch it: the
 * card moves hand -> trash without ever being on the field). Convention:
 * every COUNTER_EVENT block is `category: "auto"`.
 *
 * Driven by schema shape, not grep: every object carrying a `trigger` and a
 * `category` is inspected, including blocks nested in granted effects.
 */
import type { EffectSchema } from "./effect-types.js";

/** Categories the `executeUseCounterEvent` consumer runs. */
export const COUNTER_EVENT_EXECUTED_CATEGORIES: readonly string[] = ["auto"];

/**
 * Known gap (OPT-894 follow-up): `[Main]/[Counter]` cards authored as one block
 * with `trigger: { any_of: [MAIN_EVENT, COUNTER_EVENT] }`. Both consumers
 * (battle.ts executeUseCounterEvent, execute.ts PLAY_CARD) select with
 * `"keyword" in trigger`, so a compound trigger is never selected: the card
 * resolves neither its [Main] nor its [Counter] effect. Fixing needs either
 * consumer support for compound triggers or splitting each into a MAIN_EVENT
 * and a COUNTER_EVENT block. These ids are tolerated ONLY until that lands;
 * a NEW compound is a violation, and the pipeline test ratchets the list.
 */
export const KNOWN_COMPOUND_COUNTER_EVENT_GAP: readonly string[] = [
  "OP03-017", "OP04-038", "OP06-017", "OP06-095", "OP07-116", "OP08-019",
  "OP08-094", "OP10-040", "OP10-078", "OP15-021", "ST12-016",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** COUNTER_EVENT as the block's own keyword (what the consumer selects). */
function isDirectCounterEvent(trigger: unknown): boolean {
  return isRecord(trigger) && trigger.keyword === "COUNTER_EVENT";
}

/** COUNTER_EVENT only inside an `any_of` compound (never selected). */
function isCompoundCounterEvent(trigger: unknown): boolean {
  return (
    isRecord(trigger) &&
    Array.isArray(trigger.any_of) &&
    trigger.any_of.some((member) => isDirectCounterEvent(member) || isCompoundCounterEvent(member))
  );
}

function collect(node: unknown, path: string, found: string[], cardId: string): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child, `${path}[${index}]`, found, cardId));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if ("category" in record) {
    if (
      isDirectCounterEvent(record.trigger) &&
      !COUNTER_EVENT_EXECUTED_CATEGORIES.includes(String(record.category))
    ) {
      found.push(`${path} category "${String(record.category)}": COUNTER_EVENT blocks are only executed when category is "auto" (battle.ts executeUseCounterEvent); the [Counter] effect would never resolve`);
    } else if (
      isCompoundCounterEvent(record.trigger) &&
      !KNOWN_COMPOUND_COUNTER_EVENT_GAP.includes(cardId)
    ) {
      found.push(`${path} trigger any_of contains COUNTER_EVENT: executeUseCounterEvent selects only a direct { keyword: "COUNTER_EVENT" } block, so a compound [Main]/[Counter] trigger never resolves; split it into a MAIN_EVENT block and an auto COUNTER_EVENT block`);
    }
  }
  for (const [key, value] of Object.entries(record)) {
    collect(value, path ? `${path}.${key}` : key, found, cardId);
  }
}

/** Violations for one schema: COUNTER_EVENT blocks on an unexecuted category. */
export function findCounterEventCategoryViolations(schema: EffectSchema): string[] {
  const found: string[] = [];
  const cardId = schema.card_id ?? "UNKNOWN";
  collect(schema, "", found, cardId);
  return found.map((message) => `${cardId} ${message}`);
}

export function findCounterEventCategoryIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findCounterEventCategoryViolations);
}
