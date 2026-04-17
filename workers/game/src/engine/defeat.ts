/**
 * Defeat / win condition checks (pipeline step 7 — rule processing)
 *
 * Checked after every atomic game action.
 * Per rules §9-2-1: if both players simultaneously meet a defeat condition → draw.
 */

import type { CardData, GameState } from "../types.js";
import type { EffectSchema } from "./effect-types.js";

export interface DefeatResult {
  gameOver: boolean;
  winner: 0 | 1 | null; // null = draw
  reason: string;
}

/**
 * True when the player's Leader carries a LOSS_CONDITION_MOD / DELAYED_LOSS rule
 * modification for the DECK_OUT event (e.g., OP15-022 Brook). The immediate
 * deck-out loss is suppressed for such players; the loss is evaluated at the
 * end of the turn against the sticky `deckHitZeroThisTurn` flag.
 */
export function hasDelayedDeckOutLoss(
  state: GameState,
  playerIndex: 0 | 1,
  cardDb: Map<string, CardData> | undefined,
): boolean {
  if (!cardDb) return false;
  const leader = state.players[playerIndex].leader;
  const data = cardDb.get(leader.cardId);
  const schema = (data?.effectSchema ?? null) as EffectSchema | null;
  const mods = schema?.rule_modifications ?? [];
  return mods.some(
    (m) =>
      m.rule_type === "LOSS_CONDITION_MOD" &&
      m.trigger_event === "DECK_OUT" &&
      m.modification === "DELAYED_LOSS",
  );
}

/**
 * Run all defeat checks against current state.
 * Returns a result if the game is over, null otherwise.
 *
 * When `context.endOfTurn` is true, deck-out loses are evaluated against the
 * sticky `state.turn.deckHitZeroThisTurn` flag — this is the window in which
 * delayed-loss leaders (e.g., Brook) pay their deferred loss.
 */
export function checkDefeat(
  state: GameState,
  context: { damagedPlayerIndex?: 0 | 1; endOfTurn?: boolean } = {},
  cardDb?: Map<string, CardData>,
): DefeatResult | null {
  const [p0, p1] = state.players;

  const p0HasDelayed = hasDelayedDeckOutLoss(state, 0, cardDb);
  const p1HasDelayed = hasDelayedDeckOutLoss(state, 1, cardDb);

  // Immediate deck-out: deck is currently 0 AND player has no delayed-loss rule.
  // Delayed-loss players defer the deck-out check to end-of-turn.
  const p0DeckOutNow = p0.deck.length === 0 && !p0HasDelayed;
  const p1DeckOutNow = p1.deck.length === 0 && !p1HasDelayed;

  // End-of-turn deck-out: sticky flag set earlier in the turn AND the player
  // still carries the delayed-loss rule (e.g., Brook wasn't removed/negated).
  const sticky = state.turn.deckHitZeroThisTurn ?? [false, false];
  const p0DeckOutEot = !!context.endOfTurn && sticky[0] && p0HasDelayed;
  const p1DeckOutEot = !!context.endOfTurn && sticky[1] && p1HasDelayed;

  const p0DeckOut = p0DeckOutNow || p0DeckOutEot;
  const p1DeckOut = p1DeckOutNow || p1DeckOutEot;

  // Life-out defeat: triggered when the player has 0 life AND their leader took damage
  // this action sequence. The check is at the point damage is determined (rules §7-1-4-1-1-1).
  const p0LifeOut =
    context.damagedPlayerIndex === 0 && p0.life.length === 0;
  const p1LifeOut =
    context.damagedPlayerIndex === 1 && p1.life.length === 0;

  const p0Loses = p0DeckOut || p0LifeOut;
  const p1Loses = p1DeckOut || p1LifeOut;

  if (p0Loses && p1Loses) {
    const reason = buildReason(p0DeckOut, p0LifeOut, p1DeckOut, p1LifeOut, true);
    return { gameOver: true, winner: null, reason };
  }
  if (p0Loses) {
    const reason = p0DeckOut ? "Player 1 decked out" : "Player 1's life reached 0";
    return { gameOver: true, winner: 1, reason };
  }
  if (p1Loses) {
    const reason = p1DeckOut ? "Player 2 decked out" : "Player 2's life reached 0";
    return { gameOver: true, winner: 0, reason };
  }

  return null;
}

function buildReason(
  p0Deck: boolean,
  p0Life: boolean,
  p1Deck: boolean,
  p1Life: boolean,
  _draw: boolean,
): string {
  const reasons: string[] = [];
  if (p0Deck) reasons.push("Player 1 decked out");
  if (p0Life) reasons.push("Player 1's life reached 0");
  if (p1Deck) reasons.push("Player 2 decked out");
  if (p1Life) reasons.push("Player 2's life reached 0");
  return reasons.join("; ") + " — draw";
}
