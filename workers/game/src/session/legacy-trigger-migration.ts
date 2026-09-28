import type { CardData, GameState } from "../types.js";
import type { EffectSchema, Trigger } from "../engine/effect-types.js";
import { findCardInstance } from "../engine/state.js";

/**
 * OPT-796 load-time migration for sessions saved before
 * `LEADER_ATTACK_DEALS_DAMAGE` was replaced by `ATTACK_DEALS_DAMAGE`.
 *
 * A stored session carries its own copy of every card schema (cardDb) and of
 * every registered trigger, so a game saved before the change still holds the
 * removed event, which no longer maps to any GameEvent. Rewrite it to the
 * current authored encoding: the host's own attack (`filter.attacker: "SELF"`)
 * for "When this Leader's/Character's attack deals damage" (OP03-040/041/047/
 * 051, P-117), and any attack by the controller for OP03-043 Gaimon's "When
 * you deal damage".
 *
 * Queued triggers and effect-stack frames also embed effect blocks, but their
 * trigger was already matched and is never consulted again, so they are left
 * as stored.
 */
const LEGACY_EVENT = "LEADER_ATTACK_DEALS_DAMAGE";

/** Hosts whose legacy watcher fires on any attack by their controller. */
const CONTROLLER_WIDE_HOSTS: ReadonlySet<string> = new Set(["OP03-043"]);

function migrateTrigger(trigger: Trigger, hostCardId: string | undefined): Trigger {
  if ("any_of" in trigger) {
    const any_of = trigger.any_of.map((t) => migrateTrigger(t, hostCardId));
    return any_of.every((t, i) => t === trigger.any_of[i]) ? trigger : { ...trigger, any_of };
  }
  if (!("event" in trigger) || (trigger.event as string) !== LEGACY_EVENT) return trigger;
  const selfBound = hostCardId === undefined || !CONTROLLER_WIDE_HOSTS.has(hostCardId);
  const filter = selfBound ? { ...trigger.filter, attacker: "SELF" as const } : trigger.filter;
  return { ...trigger, event: "ATTACK_DEALS_DAMAGE", ...(filter ? { filter } : {}) };
}

function migrateSchema(schema: EffectSchema, hostCardId: string): EffectSchema {
  let changed = false;
  const effects = schema.effects.map((block) => {
    if (!block.trigger) return block;
    const trigger = migrateTrigger(block.trigger, hostCardId);
    if (trigger === block.trigger) return block;
    changed = true;
    return { ...block, trigger };
  });
  return changed ? { ...schema, effects } : schema;
}

export function migrateLegacyCardData(card: CardData): CardData {
  if (!card.effectSchema) return card;
  const effectSchema = migrateSchema(card.effectSchema, card.id);
  return effectSchema === card.effectSchema ? card : { ...card, effectSchema };
}

export function migrateLegacyTriggerRegistry(state: GameState): GameState {
  let changed = false;
  const triggerRegistry = state.triggerRegistry.map((reg) => {
    if (!reg.trigger) return reg;
    const hostCardId = findCardInstance(state, reg.sourceCardInstanceId)?.cardId;
    const trigger = migrateTrigger(reg.trigger, hostCardId);
    if (trigger === reg.trigger) return reg;
    changed = true;
    const effectBlock = reg.effectBlock?.trigger
      ? { ...reg.effectBlock, trigger: migrateTrigger(reg.effectBlock.trigger, hostCardId) }
      : reg.effectBlock;
    return { ...reg, trigger, effectBlock };
  });
  return changed ? { ...state, triggerRegistry } : state;
}
