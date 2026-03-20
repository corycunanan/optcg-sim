/**
 * Keyword helpers
 *
 * Pure functions that query keyword state from CardData.
 * In M4, keywords can also be granted by effects (via RegisteredTrigger),
 * but in M3 we only read the printed keywords.
 */

import type { CardData, CardInstance, GameState } from "../types.js";

export function hasRush(cardData: CardData): boolean {
  return cardData.keywords.rush;
}

export function hasRushCharacter(cardData: CardData): boolean {
  return cardData.keywords.rushCharacter;
}

export function hasDoubleAttack(cardData: CardData): boolean {
  return cardData.keywords.doubleAttack;
}

export function hasBanish(cardData: CardData): boolean {
  return cardData.keywords.banish;
}

export function hasBlocker(cardData: CardData): boolean {
  return cardData.keywords.blocker;
}

export function hasTrigger(cardData: CardData): boolean {
  return cardData.keywords.trigger;
}

export function hasUnblockable(cardData: CardData): boolean {
  return cardData.keywords.unblockable;
}

/**
 * Returns true if the card can attack this turn.
 * Characters cannot attack the turn they are played (summoning sickness),
 * UNLESS they have [Rush] or [Rush: Character].
 * Leaders can always attack (they are never "played").
 */
export function canAttackThisTurn(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
): boolean {
  if (cardData.type === "Leader") return true;
  if (card.turnPlayed === null) return true;
  if (card.turnPlayed !== state.turn.number) return true;
  // Played this turn — only allowed with Rush
  return hasRush(cardData) || hasRushCharacter(cardData);
}

/**
 * Returns true if the card can attack the opponent's Leader this turn.
 * [Rush: Character] can only attack Characters on the turn it is played.
 */
export function canAttackLeader(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
): boolean {
  if (!canAttackThisTurn(card, cardData, state)) return false;
  // Rush:Character played this turn can only target Characters
  if (
    hasRushCharacter(cardData) &&
    !hasRush(cardData) &&
    card.turnPlayed === state.turn.number
  ) {
    return false;
  }
  return true;
}
