/**
 * OPT-894 schema-lint rule: a `COUNTER_EVENT` trigger must sit on a block
 * category the Counter Event consumer actually executes.
 *
 * `executeUseCounterEvent` (battle.ts) selects its block with
 * `category === "auto"` and a trigger carrying COUNTER_EVENT, directly or in an
 * `any_of` compound (OPT-911: `[Main]/[Counter]` is one compound block). A Counter
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
 * Deliberately deferred (OPT-912): Counter Events whose COUNTER_EVENT block is
 * kept `activate` (non-executing) because running it today would be harmful.
 * P-059 "return any number of Characters ... +2000 for every returned
 * Character": `count: { any_number }` auto-selects EVERY own Character (no
 * subset prompt) and PER_COUNT CHARACTERS_RETURNED_THIS_WAY reads only cost
 * refs, so the boost is +0. Doing nothing is safer until OPT-912 lands.
 * Two-way ratchet: a listed card MUST still have a non-auto COUNTER_EVENT block
 * (flipping it to `auto` while listed is a violation, forcing its removal here).
 */
export const KNOWN_DEFERRED_COUNTER_EVENT: readonly string[] = ["P-059"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** COUNTER_EVENT as the block's keyword, directly or inside `any_of` (OPT-911). */
function isCounterEventTrigger(trigger: unknown): boolean {
  if (!isRecord(trigger)) return false;
  if (trigger.keyword === "COUNTER_EVENT") return true;
  return Array.isArray(trigger.any_of) && trigger.any_of.some(isCounterEventTrigger);
}

function collect(node: unknown, path: string, found: string[], cardId: string): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child, `${path}[${index}]`, found, cardId));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if ("category" in record) {
    const deferred = KNOWN_DEFERRED_COUNTER_EVENT.includes(cardId);
    const executes = COUNTER_EVENT_EXECUTED_CATEGORIES.includes(String(record.category));
    if (deferred && isCounterEventTrigger(record.trigger) && executes) {
      found.push(`${path} category "${String(record.category)}": card is listed in KNOWN_DEFERRED_COUNTER_EVENT (OPT-912) but its COUNTER_EVENT block now executes; remove it from the list`);
    } else if (!deferred && isCounterEventTrigger(record.trigger) && !executes) {
      found.push(`${path} category "${String(record.category)}": COUNTER_EVENT blocks are only executed when category is "auto" (battle.ts executeUseCounterEvent); the [Counter] effect would never resolve`);
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
