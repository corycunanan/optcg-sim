import type { EffectBlock, EffectSchema, RuntimeActiveEffect } from "./effect-types.js";
import type { CardData, GameState } from "../types.js";
import { AUTHORED_SCHEMAS } from "./authored-schemas.generated.js";
import { REPLACEMENT_ABILITY_GROUPS } from "./replacement-ability-groups.js";
import { findCardInstance } from "./state.js";

/** Structural equality, independent of object insertion order. Undefined object
 * properties have the same meaning as absent properties in authored schemas. */
export function replacementStructureEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, i) => replacementStructureEqual(value, b[i]));
  const left = Object.entries(a).filter(([, value]) => value !== undefined);
  const right = Object.entries(b).filter(([, value]) => value !== undefined);
  return left.length === right.length && left.every(([key, value]) =>
    Object.hasOwn(b, key) && replacementStructureEqual(value, Reflect.get(b, key)));
}

function sharedBody(block: EffectBlock): unknown {
  const { id: _id, replaces, zone, flags, ...body } = block;
  const { event: _event, cause_filter: _cause, ...predicate } = replaces ?? {};
  return { ...body, replaces: predicate, zone: zone ?? "FIELD",
    flags: { ...flags, optional: flags?.optional ?? false, once_per_turn: flags?.once_per_turn ?? false } };
}

/** Catalog lint and saved-schema compatibility share the same allowed relation:
 * only the event/cause alternatives differ; every other ability property agrees. */
export function validateReplacementAbilityGroups(
  schema: EffectSchema,
  groups: readonly (readonly string[])[] = REPLACEMENT_ABILITY_GROUPS[schema.card_id ?? ""] ?? [],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (group.length < 2) errors.push("Replacement ability group needs at least two blocks");
    const members = group.map((id) => {
      if (seen.has(id)) errors.push(`Replacement ability group repeats block '${id}'`);
      seen.add(id);
      const matching = schema.effects.filter((block) => block?.id === id);
      const block = matching.length === 1 ? matching[0] : undefined;
      if (!block || block.category !== "replacement" || !block.replaces)
        errors.push(`Replacement ability group has missing/nonreplacement block '${id}'`);
      return block;
    });
    const first = members[0];
    if (first && members.some((block) => block && !replacementStructureEqual(sharedBody(first), sharedBody(block))))
      errors.push("Replacement ability group members differ outside event/cause predicates");
  }
  return errors;
}

function compatibleGroup(state: GameState, effect: RuntimeActiveEffect, cardDb: Map<string, CardData>): readonly string[] | undefined {
  const card = findCardInstance(state, effect.sourceCardInstanceId);
  const schema = card && cardDb.get(card.cardId)?.effectSchema;
  if (!schema || schema.card_id !== card?.cardId) return;
  const group = REPLACEMENT_ABILITY_GROUPS[schema.card_id]?.find((ids) => ids.includes(effect.sourceEffectBlockId));
  if (!group || validateReplacementAbilityGroups(schema, [group]).length) return;
  const canonical = AUTHORED_SCHEMAS[schema.card_id];
  // Pure compatibility view of old saved CardData; never reinject or overwrite it.
  // Custom/modified bodies are not silently assigned canonical ability identity.
  if (!canonical || group.some((id) => !replacementStructureEqual(
    schema.effects.find((block) => block.id === id), canonical.effects.find((block) => block.id === id)))) return;
  const block = schema.effects.find((candidate) => candidate.id === effect.sourceEffectBlockId)!;
  const expected = { trigger: block.replaces!.event, cause_filter: block.replaces!.cause_filter ?? null,
    target_filter: block.replaces!.target_filter ?? null, replacement_actions: block.replacement_actions ?? [],
    optional: block.flags?.optional ?? false, once_per_turn: block.flags?.once_per_turn ?? false };
  const mods = effect.modifiers.filter((modifier) => modifier.type === "REPLACEMENT_EFFECT");
  const params = mods[0]?.params;
  if (!params || mods.length !== 1 || effect.modifiers.length !== 1 || effect.category !== "replacement" || effect.controller !== card.controller
    || !replacementStructureEqual(effect.duration, { type: "PERMANENT" })
    || !replacementStructureEqual(effect.expiresAt, { wave: "SOURCE_LEAVES_ZONE" })
    || !replacementStructureEqual(effect.conditions, block.conditions)
    || !replacementStructureEqual(effect.appliesTo, block.replaces!.target_filter ? [] : [card.instanceId])) return;
  const { usedOnTurn: _used, ...body } = params;
  if (!replacementStructureEqual(body, expected)) return;
  return group;
}

/** Concrete active-effect IDs are retained everywhere. No IDs or state mutate. */
export function replacementAbilitySiblings(state: GameState, effectId: string, cardDb: Map<string, CardData>): string[] {
  const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
  if (!effect) return [effectId];
  const group = compatibleGroup(state, effect, cardDb);
  if (!group) return [effectId];
  return state.activeEffects.filter((candidate) => candidate.sourceCardInstanceId === effect.sourceCardInstanceId
    && compatibleGroup(state, candidate, cardDb) === group).map((candidate) => candidate.id);
}

export function expandReplacementVisits(state: GameState, ids: string[], cardDb: Map<string, CardData>): string[] {
  return [...new Set(ids.flatMap((id) => replacementAbilitySiblings(state, id, cardDb)))];
}
