/**
 * OPT-801 schema-lint rule: every authored `trigger.event` must be matchable.
 *
 * `customEventMatchesGameEvent` (triggers.ts) resolves a custom event either
 * through `CUSTOM_EVENT_TO_GAME_EVENT` or a bespoke branch
 * (`CHARACTER_REMOVED_FROM_FIELD`). Any other value silently never fires —
 * OP11-041 shipped on the unmapped `LIFE_CARD_REMOVED` and never drew.
 *
 * Driven by schema shape, not grep: every object under a `trigger` key is
 * walked, including `any_of` compound members and triggers nested in granted
 * effect blocks. Keyword triggers carry no `event` and are out of scope.
 * Replacement `replaces.event` values use a separate vocabulary and are not
 * under a `trigger` key, so they are never inspected here.
 */
import type { EffectSchema } from "./effect-types.js";
import { isMatchableCustomEvent } from "./triggers.js";

function checkTrigger(
  trigger: unknown,
  path: string,
  found: string[]): void {
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger)) return;
  const record = trigger as Record<string, unknown>;
  if ("event" in record) {
    const event = record.event;
    if (typeof event !== "string" || !isMatchableCustomEvent(event)) {
      found.push(`${path}.event "${String(event)}"`);
    }
  }
  if (Array.isArray(record.any_of)) {
    record.any_of.forEach((member, index) =>
      checkTrigger(member, `${path}.any_of[${index}]`, found),
    );
  }
}

function collectViolations(
  node: unknown,
  path: string,
  found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectViolations(child, `${path}[${index}]`, found));
    return;
  }
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === "trigger") checkTrigger(value, childPath, found);
    collectViolations(value, childPath, found);
  }
}

/** Violations for one schema: each authored trigger event with no matcher. */
export function findUnmatchableTriggerEventViolations(schema: EffectSchema): string[] {
  const found: string[] = [];
  collectViolations(schema, "", found);
  const cardId = schema.card_id ?? "UNKNOWN";
  return found.map(
    (where) =>
      `${cardId} ${where}: trigger event has no matcher in triggers.ts customEventMatchesGameEvent and never fires; use a mapped event or add the mapping`,
  );
}

export function findTriggerEventIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findUnmatchableTriggerEventViolations);
}
