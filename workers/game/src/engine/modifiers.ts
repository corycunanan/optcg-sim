/**
 * Modifier Layer System
 *
 * Power and cost are computed fresh via an ordered layer stack.
 * They are never stored as mutated values on the card.
 *
 * Layer 0: Base printed value (from card DB)
 * Layer 1: Base-setting effects (SET_POWER, e.g., "This Character's power becomes 0")
 * Layer 2: Additive/subtractive modifiers (MODIFY_POWER from effect resolver)
 * DON!! bonus: +1000 × attachedDon, owner's turn only (rules §6-5-5-2)
 */

import type { CardInstance, CardData, GameState } from "../types.js";
import type {
  RuntimeActiveEffect,
  RuntimeOneTimeModifier,
  Condition,
  TargetFilter,
  EffectSchema,
} from "./effect-types.js";
import type { CardData as CardDataType } from "../types.js";
import { evaluateCondition, type ConditionContext } from "./conditions.js";
import { findCardInstance } from "./state.js";

/**
 * Check whether a permanent WHILE_CONDITION effect's condition is currently met.
 * Returns true for effects that have no WHILE_CONDITION duration (always active).
 */
export function isEffectConditionMet(
  effect: RuntimeActiveEffect,
  state: GameState,
  cardDb?: Map<string, CardDataType>,
): boolean {
  const duration = effect.duration as { type: string; condition?: Condition } | undefined;
  if (!duration || duration.type !== "WHILE_CONDITION" || !duration.condition) return true;
  if (!cardDb) return true; // can't evaluate without cardDb — assume active

  const condCtx: ConditionContext = {
    sourceCardInstanceId: effect.sourceCardInstanceId,
    controller: effect.controller,
    cardDb,
  };

  return evaluateCondition(state, duration.condition, condCtx);
}

/**
 * Returns the effective power of a card in the current game state.
 * Power can be negative — no floor (rules §1-3-6-1).
 */
export function getEffectivePower(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardDataType>,
): number {
  // Layer 0: base printed value
  let power = cardData.power ?? 0;

  // Layer 1: base-setting effects
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const baseSetters = effects.filter((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) => m.type === "SET_POWER") &&
    isEffectConditionMet(e, state, cardDb),
  );
  if (baseSetters.length > 0) {
    // Last base-setter wins (timestamp order)
    const lastSetter = baseSetters[baseSetters.length - 1];
    const mod = lastSetter.modifiers?.find((m) => m.type === "SET_POWER");
    if (mod?.params?.value !== undefined) {
      power = mod.params.value as number;
    }
  }

  // Layer 2: additive/subtractive modifiers
  const additiveEffects = effects.filter((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) => m.type === "MODIFY_POWER") &&
    isEffectConditionMet(e, state, cardDb),
  );
  for (const effect of additiveEffects) {
    for (const mod of effect.modifiers ?? []) {
      if (mod.type === "MODIFY_POWER" && mod.params?.amount !== undefined) {
        power += mod.params.amount as number;
      }
    }
  }

  // DON!! bonus: +1000 per attached DON!!, owner's turn only
  const isOwnersTurn = state.turn.activePlayerIndex === card.owner;
  if (isOwnersTurn) {
    power += card.attachedDon.length * 1000;
  }

  return power;
}

/**
 * Returns the effective cost for playing a card.
 * Clamped to minimum 0 for payment purposes (rules §1-3-5-1).
 *
 * @param cardDb - Optional card database, required for hand-zone modifier evaluation
 */
export function getEffectiveCost(
  cardData: CardData,
  state?: GameState,
  cardInstanceId?: string,
  cardDb?: Map<string, CardData>,
): number {
  // Layer 0
  let cost = cardData.cost ?? 0;

  // Layer 1 & 2: Cost modifiers from active effects
  if (state && cardInstanceId) {
    const effects = state.activeEffects as RuntimeActiveEffect[];
    for (const effect of effects) {
      if (!effect.appliesTo?.includes(cardInstanceId)) continue;
      for (const mod of effect.modifiers ?? []) {
        if (mod.type === "MODIFY_COST" && mod.params?.amount !== undefined) {
          cost += mod.params.amount as number;
        }
        if (mod.type === "SET_COST" && mod.params?.value !== undefined) {
          cost = mod.params.value as number;
        }
      }
    }

    // One-time modifiers (unconsumed, matching cost modification for this play action)
    const oneTimeModifiers = state.oneTimeModifiers as RuntimeOneTimeModifier[];
    for (const otm of oneTimeModifiers) {
      if (otm.consumed) continue;
      if (otm.modification.type !== "MODIFY_COST") continue;
      if (!matchesOneTimeFilter(otm, cardData, state)) continue;

      if (otm.modification.params?.amount !== undefined) {
        cost += otm.modification.params.amount as number;
      }
    }

    // Hand-zone permanent modifiers (self-cost-reduction while in hand)
    if (cardDb) {
      cost += getHandZoneSelfCostModifier(cardData, state, cardInstanceId, cardDb);
      cost += getFieldToHandCostModifier(cardData, state, cardInstanceId, cardDb);
    }
  }

  return Math.max(0, cost);
}

// ─── Hand-Zone Modifiers ────────────────────────────────────────────────────

/**
 * Evaluate hand-zone permanent blocks on a card's own schema.
 * Returns the total cost adjustment (negative = cheaper).
 *
 * These are permanent effect blocks with `zone: "HAND"` and MODIFY_COST modifiers
 * that reduce the card's own cost while it sits in hand, conditioned on game state.
 */
function getHandZoneSelfCostModifier(
  cardData: CardData,
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
): number {
  const card = findCardInstance(state, cardInstanceId);
  if (!card || card.zone !== "HAND") return 0;

  const schema = cardData.effectSchema as EffectSchema | null;
  if (!schema?.effects) return 0;

  const ctx: ConditionContext = {
    sourceCardInstanceId: cardInstanceId,
    controller: card.controller,
    cardDb,
  };

  let adjustment = 0;

  for (const block of schema.effects) {
    if (block.category !== "permanent") continue;
    if (block.zone !== "HAND") continue;
    if (!block.modifiers) continue;

    // Evaluate block-level conditions
    if (block.conditions && !evaluateCondition(state, block.conditions, ctx)) continue;

    for (const mod of block.modifiers) {
      if (mod.type === "MODIFY_COST" && mod.params?.amount !== undefined) {
        adjustment += mod.params.amount as number;
      }
    }
  }

  return adjustment;
}

/**
 * Evaluate field-to-hand cost modifiers from other cards on the field.
 * Returns the total cost adjustment for a card in hand.
 *
 * Example: OP01-067 Crocodile — while on field with DON!!×1, gives blue Events
 * in your hand −1 cost. These are permanent blocks on field cards whose modifiers
 * target CARD_IN_HAND.
 */
function getFieldToHandCostModifier(
  cardData: CardData,
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
): number {
  const card = findCardInstance(state, cardInstanceId);
  if (!card || card.zone !== "HAND") return 0;

  let adjustment = 0;

  for (const player of state.players) {
    // Check leader, characters, and stage for field-to-hand modifiers
    const fieldCards: CardInstance[] = [
      player.leader,
      ...player.characters.filter(Boolean) as CardInstance[],
      ...(player.stage ? [player.stage] : []),
    ];

    for (const fieldCard of fieldCards) {
      const fieldCardData = cardDb.get(fieldCard.cardId);
      if (!fieldCardData) continue;

      const schema = fieldCardData.effectSchema as EffectSchema | null;
      if (!schema?.effects) continue;

      for (const block of schema.effects) {
        if (block.category !== "permanent") continue;
        // Default zone is FIELD — skip HAND-zone blocks (those are self-reduction)
        if (block.zone === "HAND") continue;
        if (!block.modifiers) continue;

        // Only consider blocks that have MODIFY_COST targeting CARD_IN_HAND
        const handCostMods = block.modifiers.filter(
          (m) => m.type === "MODIFY_COST" && m.target?.type === "CARD_IN_HAND",
        );
        if (handCostMods.length === 0) continue;

        // Evaluate block-level conditions
        const ctx: ConditionContext = {
          sourceCardInstanceId: fieldCard.instanceId,
          controller: fieldCard.controller,
          cardDb,
        };
        if (block.conditions && !evaluateCondition(state, block.conditions, ctx)) continue;

        // Check if the hand card matches the modifier's target filter
        for (const mod of handCostMods) {
          if (!mod.target?.controller) continue;

          // Controller check: the modifier's controller is relative to the field card
          const targetControllerIdx = mod.target.controller === "SELF"
            ? fieldCard.controller
            : mod.target.controller === "OPPONENT"
              ? (1 - fieldCard.controller) as 0 | 1
              : null;
          if (targetControllerIdx !== null && targetControllerIdx !== card.controller) continue;

          // Filter check
          if (mod.target.filter && !matchesHandCardFilter(mod.target.filter, cardData)) continue;

          if (mod.params?.amount !== undefined) {
            adjustment += mod.params.amount as number;
          }
        }
      }
    }
  }

  return adjustment;
}

/**
 * Check if a card in hand matches a target filter from a field-to-hand modifier.
 */
function matchesHandCardFilter(filter: TargetFilter, cardData: CardData): boolean {
  if (filter.color) {
    const cardColors = Array.isArray(cardData.color) ? cardData.color : [cardData.color];
    if (!cardColors.includes(filter.color)) return false;
  }
  if (filter.color_includes) {
    const cardColors = Array.isArray(cardData.color) ? cardData.color : [cardData.color];
    if (!filter.color_includes.some((c) => cardColors.includes(c))) return false;
  }
  if (filter.card_type) {
    const types = Array.isArray(filter.card_type) ? filter.card_type : [filter.card_type];
    if (!types.includes(cardData.type?.toUpperCase() ?? "")) return false;
  }
  if (filter.traits) {
    const cardTraits = cardData.types ?? [];
    if (!filter.traits.every((t: string) => cardTraits.includes(t))) return false;
  }
  if (filter.cost_max !== undefined) {
    if (typeof filter.cost_max === "number" && (cardData.cost ?? 0) > filter.cost_max) return false;
  }
  return true;
}

/**
 * Check if a card has a specific granted keyword from active effects.
 */
export function hasGrantedKeyword(
  card: CardInstance,
  keyword: string,
  state: GameState,
  cardDb?: Map<string, CardDataType>,
): boolean {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  return effects.some((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) =>
      m.type === "GRANT_KEYWORD" && m.params?.keyword === keyword,
    ) &&
    isEffectConditionMet(e, state, cardDb),
  );
}

/**
 * Check if a card has a specific removed keyword from active effects.
 */
export function hasRemovedKeyword(
  card: CardInstance,
  keyword: string,
  state: GameState,
  cardDb?: Map<string, CardDataType>,
): boolean {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  return effects.some((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) =>
      m.type === "REMOVE_KEYWORD" && m.params?.keyword === keyword,
    ) &&
    isEffectConditionMet(e, state, cardDb),
  );
}

/**
 * Returns the power contributed by symbol counters played this battle.
 * Stored on BattleContext.counterPowerAdded, not on the card.
 */
export function getBattleDefenderPower(
  defenderCard: CardInstance,
  defenderCardData: CardData,
  counterPowerAdded: number,
  state: GameState,
  cardDb?: Map<string, CardDataType>,
): number {
  return getEffectivePower(defenderCard, defenderCardData, state, cardDb) + counterPowerAdded;
}

// ─── One-Time Modifiers ──────────────────────────────────────────────────────

/**
 * Consume all matching one-time modifiers when a card is played.
 * Returns a new GameState with consumed modifiers marked.
 */
export function consumeOneTimeModifiers(
  state: GameState,
  cardData: CardData,
  controller: 0 | 1,
): GameState {
  const modifiers = state.oneTimeModifiers as RuntimeOneTimeModifier[];
  let changed = false;

  const updated = modifiers.map((otm) => {
    if (otm.consumed) return otm;
    if (otm.controller !== controller) return otm;
    if (otm.modification.type !== "MODIFY_COST") return otm;
    if (!matchesOneTimeFilter(otm, cardData, state)) return otm;

    changed = true;
    return { ...otm, consumed: true };
  });

  if (!changed) return state;
  return { ...state, oneTimeModifiers: updated as any };
}

/**
 * Remove all consumed one-time modifiers from state.
 */
export function cleanupConsumedOneTimeModifiers(state: GameState): GameState {
  const modifiers = state.oneTimeModifiers as RuntimeOneTimeModifier[];
  const remaining = modifiers.filter((m) => !m.consumed);
  if (remaining.length === modifiers.length) return state;
  return { ...state, oneTimeModifiers: remaining as any };
}

/**
 * Remove expired one-time modifiers (by turn number for THIS_TURN duration).
 */
export function expireOneTimeModifiers(state: GameState): GameState {
  const modifiers = state.oneTimeModifiers as RuntimeOneTimeModifier[];
  const remaining = modifiers.filter((m) => {
    if (m.consumed) return false;
    if (m.expires.type === "THIS_TURN") return false; // End of turn = expired
    return true;
  });
  if (remaining.length === modifiers.length) return state;
  return { ...state, oneTimeModifiers: remaining as any };
}

function matchesOneTimeFilter(
  otm: RuntimeOneTimeModifier,
  cardData: CardData,
  _state: GameState,
): boolean {
  const filter = otm.appliesTo.filter;
  if (!filter) return true;

  if ((filter as any).costMax !== undefined) {
    if ((cardData.cost ?? 0) > ((filter as any).costMax as number)) return false;
  }
  if ((filter as any).costMin !== undefined) {
    if ((cardData.cost ?? 0) < ((filter as any).costMin as number)) return false;
  }
  if ((filter as any).traits) {
    const traits = (filter as any).traits as string[];
    const cardTraits = cardData.types ?? [];
    if (!traits.every((t: string) => cardTraits.includes(t))) return false;
  }
  if ((filter as any).color) {
    const colors = Array.isArray((filter as any).color) ? (filter as any).color : [(filter as any).color];
    if (!colors.includes(cardData.color)) return false;
  }
  if ((filter as any).name) {
    if (cardData.name !== (filter as any).name) return false;
  }
  if ((filter as any).card_type) {
    if (cardData.type?.toUpperCase() !== ((filter as any).card_type as string).toUpperCase()) return false;
  }
  return true;
}
