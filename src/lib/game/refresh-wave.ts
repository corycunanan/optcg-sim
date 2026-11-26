import type { CardInstance, DonInstance, PlayerState } from "@shared/game-types";
import { donReturnFlight, refreshStandUp } from "@/lib/motion";

/**
 * OPT-1058: Refresh Phase presentation.
 *
 * The worker runs a whole start of turn in one update, so the client sees
 * the board jump from "end of the opponent's turn" to "Main Phase": attached
 * DON!! already back in the cost area and every rested card already
 * standing. The board replays it in two steps (Card Motion Lab "Refresh
 * Phase"):
 *
 * 1. Attached DON!! slide out from under their cards to the cost area,
 *    30ms apart, and land rested. Each card's DON!! badge counts down as its
 *    tokens leave.
 * 2. Rested cards and DON!! stand up left to right by board x, 60ms apart,
 *    each a 180ms rotate.
 *
 * The functions here are pure: `diffRefresh` reads the board before and
 * after the update, and `planRefreshWave` turns the counts into a schedule.
 */

/** One attached DON!! returning to the cost area. */
export interface RefreshReturnToken {
  /** The DON!! (the same instance id in the cost area afterwards). */
  donInstanceId: string;
  /** The Leader or Character it was attached to. */
  cardInstanceId: string;
}

export interface RefreshDiff {
  /** Attached DON!! now in the cost area: Leader first, then Characters in
   *  slot order, each card's DON!! in attach order. */
  returns: RefreshReturnToken[];
  /** Field cards and cost-area DON!! that were rested and now stand. The
   *  returning DON!! are included: they land rested and stand with the rest. */
  standing: string[];
}

function fieldCards(player: PlayerState): CardInstance[] {
  const cards: CardInstance[] = [player.leader];
  for (const character of player.characters) if (character) cards.push(character);
  return cards;
}

/** What the Refresh Phase changed for one player, or null when nothing
 *  visibly moved (a player's first turn). */
export function diffRefresh(
  before: PlayerState,
  after: PlayerState
): RefreshDiff | null {
  const costAfter = new Map<string, DonInstance>(
    after.donCostArea.map((don) => [don.instanceId, don])
  );
  const returns: RefreshReturnToken[] = [];
  for (const card of fieldCards(before)) {
    for (const don of card.attachedDon) {
      if (!costAfter.has(don.instanceId)) continue;
      returns.push({ donInstanceId: don.instanceId, cardInstanceId: card.instanceId });
    }
  }

  const standing: string[] = [];
  const afterCards = new Map<string, CardInstance>();
  for (const card of fieldCards(after)) afterCards.set(card.instanceId, card);
  if (after.stage) afterCards.set(after.stage.instanceId, after.stage);
  const beforeCards = [...fieldCards(before), ...(before.stage ? [before.stage] : [])];
  for (const card of beforeCards) {
    if (card.state !== "RESTED") continue;
    if (afterCards.get(card.instanceId)?.state === "ACTIVE") standing.push(card.instanceId);
  }
  for (const don of before.donCostArea) {
    if (don.state !== "RESTED") continue;
    if (costAfter.get(don.instanceId)?.state === "ACTIVE") standing.push(don.instanceId);
  }
  for (const token of returns) {
    if (costAfter.get(token.donInstanceId)?.state === "ACTIVE") {
      standing.push(token.donInstanceId);
    }
  }

  if (returns.length === 0 && standing.length === 0) return null;
  return { returns, standing };
}

export interface RefreshWavePlan {
  /** Per returning DON!!, ms after the wave starts when it leaves its card. */
  returnDelaysMs: number[];
  /** When the first card stands up. */
  standStartMs: number;
  /** Spacing between stand-ups, left to right. */
  standStaggerMs: number;
  /** When the last stand-up has finished. */
  durationMs: number;
}

/**
 * Schedule a Refresh Phase wave. The stand-up keeps 60ms spacing, but the
 * whole spread is capped (`refreshStandUp.maxSpreadMs`) so a full cost area
 * does not drag out the start of the turn.
 */
export function planRefreshWave(
  returnCount: number,
  standCount: number
): RefreshWavePlan {
  const returnDelaysMs = Array.from(
    { length: returnCount },
    (_, i) => i * donReturnFlight.staggerMs
  );
  const returnsEndMs =
    returnCount > 0
      ? (returnCount - 1) * donReturnFlight.staggerMs + donReturnFlight.durationMs
      : 0;
  const standStartMs = returnCount > 0 ? returnsEndMs + refreshStandUp.gapMs : 0;
  const standStaggerMs =
    standCount > 1
      ? Math.min(
          refreshStandUp.staggerMs,
          refreshStandUp.maxSpreadMs / (standCount - 1)
        )
      : 0;
  const standMs = Math.round(refreshStandUp.transition.duration * 1000);
  const durationMs =
    standCount > 0
      ? standStartMs + (standCount - 1) * standStaggerMs + standMs
      : returnsEndMs;
  return { returnDelaysMs, standStartMs, standStaggerMs, durationMs };
}

/**
 * Stand-up delays in seconds, left to right by screen x. Ids whose
 * position is unknown keep their relative order after the measured ones.
 */
export function standUpDelays(
  ids: readonly string[],
  xOf: (id: string) => number | null,
  staggerMs: number
): Map<string, number> {
  const measured = ids.map((id, index) => ({ id, index, x: xOf(id) }));
  measured.sort((a, b) => {
    if (a.x === null && b.x === null) return a.index - b.index;
    if (a.x === null) return 1;
    if (b.x === null) return -1;
    return a.x - b.x || a.index - b.index;
  });
  return new Map(measured.map((item, i) => [item.id, (i * staggerMs) / 1000]));
}
