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
import type { RuntimeActiveEffect } from "./effect-types.js";

/**
 * Returns the effective power of a card in the current game state.
 * Power can be negative — no floor (rules §1-3-6-1).
 */
export function getEffectivePower(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
): number {
  // Layer 0: base printed value
  let power = cardData.power ?? 0;

  // Layer 1: base-setting effects
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const baseSetters = effects.filter((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) => m.type === "SET_POWER"),
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
    e.modifiers?.some((m) => m.type === "MODIFY_POWER"),
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
 */
export function getEffectiveCost(
  cardData: CardData,
  state?: GameState,
  cardInstanceId?: string,
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
  }

  return Math.max(0, cost);
}

/**
 * Check if a card has a specific granted keyword from active effects.
 */
export function hasGrantedKeyword(
  card: CardInstance,
  keyword: string,
  state: GameState,
): boolean {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  return effects.some((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) =>
      m.type === "GRANT_KEYWORD" && m.params?.keyword === keyword,
    ),
  );
}

/**
 * Check if a card has a specific removed keyword from active effects.
 */
export function hasRemovedKeyword(
  card: CardInstance,
  keyword: string,
  state: GameState,
): boolean {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  return effects.some((e) =>
    e.appliesTo?.includes(card.instanceId) &&
    e.modifiers?.some((m) =>
      m.type === "REMOVE_KEYWORD" && m.params?.keyword === keyword,
    ),
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
): number {
  return getEffectivePower(defenderCard, defenderCardData, state) + counterPowerAdded;
}
