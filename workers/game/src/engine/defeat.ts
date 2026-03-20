/**
 * Defeat / win condition checks (pipeline step 7 — rule processing)
 *
 * Checked after every atomic game action.
 * Per rules §9-2-1: if both players simultaneously meet a defeat condition → draw.
 */

import type { GameState } from "../types.js";

export interface DefeatResult {
  gameOver: boolean;
  winner: 0 | 1 | null; // null = draw
  reason: string;
}

/**
 * Run all defeat checks against current state.
 * Returns a result if the game is over, null otherwise.
 */
export function checkDefeat(
  state: GameState,
  context: { damagedPlayerIndex?: 0 | 1 } = {},
): DefeatResult | null {
  const [p0, p1] = state.players;

  const p0DeckOut = p0.deck.length === 0;
  const p1DeckOut = p1.deck.length === 0;

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
