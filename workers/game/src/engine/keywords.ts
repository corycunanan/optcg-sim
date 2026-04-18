/**
 * Keyword helpers
 *
 * Pure functions that query keyword state from CardData + active effects.
 * Printed keywords come from `cardData.keywords`; keywords granted by effects
 * live on `state.activeEffects` as GRANT_KEYWORD modifiers.
 *
 * OPT-253: "has X" at runtime is `(printed AND !negated) OR externally granted`.
 * Negation suppresses schema-printed keywords but not keywords granted by
 * other cards (those originate outside the negated card's schema).
 */

import type { CardData, CardInstance, GameState } from "../types.js";
import { hasGrantedKeyword, isCardNegated } from "./modifiers.js";

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
  const negated = isCardNegated(card, state, cardDb);
  const printed = cardData.keywords.rush && !negated;
  return printed || hasGrantedKeyword(card, "RUSH", state, cardDb);
}

function hasEffectiveRushCharacter(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardData>,
): boolean {
  const negated = isCardNegated(card, state, cardDb);
  const printed = cardData.keywords.rushCharacter && !negated;
  return printed || hasGrantedKeyword(card, "RUSH_CHARACTER", state, cardDb);
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
 * OPT-253: runtime keyword check — printed keyword is suppressed while the
 * Character is effect-negated; externally granted keywords always apply.
 */
export function hasEffectiveKeyword(
  card: CardInstance,
  cardData: CardData,
  keyword: "BLOCKER" | "RUSH" | "RUSH_CHARACTER" | "DOUBLE_ATTACK" | "BANISH" | "UNBLOCKABLE" | "TRIGGER",
  state: GameState,
  cardDb?: Map<string, CardData>,
): boolean {
  const negated = isCardNegated(card, state, cardDb);
  let printed = false;
  switch (keyword) {
    case "BLOCKER": printed = cardData.keywords.blocker; break;
    case "RUSH": printed = cardData.keywords.rush; break;
    case "RUSH_CHARACTER": printed = cardData.keywords.rushCharacter; break;
    case "DOUBLE_ATTACK": printed = cardData.keywords.doubleAttack; break;
    case "BANISH": printed = cardData.keywords.banish; break;
    case "UNBLOCKABLE": printed = cardData.keywords.unblockable; break;
    case "TRIGGER": printed = cardData.keywords.trigger; break;
  }
  if (printed && !negated) return true;
  return hasGrantedKeyword(card, keyword, state, cardDb);
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
