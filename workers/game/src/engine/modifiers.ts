/**
 * Modifier Layer System
 *
 * Power and cost are computed fresh via an ordered layer stack.
 * They are never stored as mutated values on the card.
 *
 * Layer 0: Base printed value (from card DB)
 * Layer 1: Base-setting effects (M4 — empty in M3)
 * Layer 2: Additive/subtractive modifiers (M4 — battle counters only in M3)
 * DON!! bonus: +1000 × attachedDon, owner's turn only (rules §6-5-5-2)
 */

import type { CardInstance, CardData, GameState } from "../types.js";

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

  // Layer 1: base-setting effects (M4 — no-op)

  // Layer 2: additive/subtractive modifiers from active effects (M4 — no-op)
  // Battle counter power is applied directly to defenderPower on BattleContext
  // and not stored on the card, so no layer-2 work needed in M3.

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
export function getEffectiveCost(cardData: CardData): number {
  // Layer 0
  const base = cardData.cost ?? 0;

  // Layer 1 & 2: M4 cost modifiers (no-op in M3)

  return Math.max(0, base);
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
