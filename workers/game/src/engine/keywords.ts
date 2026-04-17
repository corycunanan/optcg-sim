/**
 * Keyword helpers
 *
 * Pure functions that query keyword state from CardData + active effects.
 * Printed keywords come from `cardData.keywords`; keywords granted by effects
 * live on `state.activeEffects` as GRANT_KEYWORD modifiers.
 */

import type { CardData, CardInstance, GameState } from "../types.js";
import { hasGrantedKeyword } from "./modifiers.js";

export function hasRush(cardData: CardData): boolean {
  return cardData.keywords.rush;
}

export function hasRushCharacter(cardData: CardData): boolean {
  return cardData.keywords.rushCharacter;
}

function hasEffectiveRush(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardData>,
): boolean {
  return cardData.keywords.rush || hasGrantedKeyword(card, "RUSH", state, cardDb);
}

function hasEffectiveRushCharacter(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardData>,
): boolean {
  return cardData.keywords.rushCharacter || hasGrantedKeyword(card, "RUSH_CHARACTER", state, cardDb);
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
 * UNLESS they have [Rush] or [Rush: Character] — either printed or granted
 * by an active effect whose condition currently holds.
 * Leaders can always attack (they are never "played").
 */
export function canAttackThisTurn(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardData>,
): boolean {
  if (cardData.type === "Leader") return true;
  if (card.turnPlayed === null) return true;
  if (card.turnPlayed !== state.turn.number) return true;
  return (
    hasEffectiveRush(card, cardData, state, cardDb) ||
    hasEffectiveRushCharacter(card, cardData, state, cardDb)
  );
}

/**
 * Returns true if the card can attack the opponent's Leader this turn.
 * [Rush: Character] alone allows only Character targets on the turn played;
 * a concurrent [Rush] (printed or granted) re-opens Leader targets.
 */
export function canAttackLeader(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardData>,
): boolean {
  if (!canAttackThisTurn(card, cardData, state, cardDb)) return false;
  if (card.turnPlayed !== state.turn.number) return true;
  const rushChar = hasEffectiveRushCharacter(card, cardData, state, cardDb);
  const rush = hasEffectiveRush(card, cardData, state, cardDb);
  if (rushChar && !rush) return false;
  return true;
}
