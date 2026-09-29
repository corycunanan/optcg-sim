/**
 * OPT-797 schema-lint rule: context-seeded target types only where the
 * runtime seeds their reference.
 *
 * - `BATTLE_TARGET` resolves from the battle event that triggered the block
 *   (`battleTargetRefFor` in effect-resolver/resolver.ts). It is valid only in
 *   the `actions` of an auto block whose every trigger branch is one of
 *   `BATTLE_TARGET_TRIGGER_EVENTS`; anywhere else it silently resolves to
 *   nothing.
 * - `REPLACED_CARD` resolves from the replaced event (`applyReplacement` in
 *   replacements.ts). It is valid only in the `replacement_actions` of a
 *   replacement block.
 *
 * Driven by schema shape: every effect block is walked, including blocks
 * nested in actions (granted effects), and each nested block resets the
 * context to its own trigger/category.
 */
import {
  BATTLE_TARGET_TRIGGER_EVENTS,
  type EffectSchema,
} from "./effect-types.js";

interface Context {
  battle: boolean;
  replaced: boolean;
}

const NONE: Context = { battle: false, replaced: false };

function isBattleTrigger(trigger: unknown): boolean {
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger)) return false;
  const record = trigger as Record<string, unknown>;
  if (Array.isArray(record.any_of)) {
    return record.any_of.length > 0 && record.any_of.every(isBattleTrigger);
  }
  return typeof record.event === "string" &&
    (BATTLE_TARGET_TRIGGER_EVENTS as readonly string[]).includes(record.event);
}

function isEffectBlock(record: Record<string, unknown>): boolean {
  return typeof record.category === "string" &&
    ("actions" in record || "replacement_actions" in record || "trigger" in record);
}

function walk(node: unknown, path: string, ctx: Context, found: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => walk(child, `${path}[${index}]`, ctx, found));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;

  if (isEffectBlock(record)) {
    const battle = record.category === "auto" && isBattleTrigger(record.trigger);
    const replaced = record.category === "replacement";
    for (const [key, value] of Object.entries(record)) {
      const childPath = `${path}.${key}`;
      if (key === "actions") walk(value, childPath, { battle, replaced: false }, found);
      else if (key === "replacement_actions") walk(value, childPath, { battle: false, replaced }, found);
      else walk(value, childPath, NONE, found);
    }
    return;
  }

  if (record.type === "BATTLE_TARGET" && !ctx.battle) {
    found.push(`${path}: BATTLE_TARGET is seeded only for auto blocks triggered by ${BATTLE_TARGET_TRIGGER_EVENTS.join("/")} and resolves to nothing here`);
  }
  if (record.type === "REPLACED_CARD" && !ctx.replaced) {
    found.push(`${path}: REPLACED_CARD is seeded only inside a replacement block's replacement_actions and resolves to nothing here`);
  }
  for (const [key, value] of Object.entries(record)) {
    walk(value, path ? `${path}.${key}` : key, ctx, found);
  }
}

/** Violations for one schema: each context-seeded target outside its context. */
export function findContextTargetViolations(schema: EffectSchema): string[] {
  const found: string[] = [];
  const cardId = schema.card_id ?? "UNKNOWN";
  walk(schema.effects, `${cardId} effects`, NONE, found);
  walk(schema.rule_modifications, `${cardId} rule_modifications`, NONE, found);
  return found;
}

export function findContextTargetIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findContextTargetViolations);
}
