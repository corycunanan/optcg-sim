/**
 * Rule 3-1-6-1 (docs/rules/rule_comprehensive.md:289): "When a DON!! card
 * moves from one area to another, all effects that were previously applied to
 * that DON!! card are removed."
 *
 * DON!! keep their instance id across area moves (cost area ↔ attached ↔
 * DON!! deck, and between players' cost areas), so id-keyed effects would
 * otherwise follow a DON!! into its new area — e.g. an OP07-026 refresh hold
 * surviving OP15-026 Jango giving that DON!! to a Character (OPT-792).
 *
 * `releaseMovedDonEffects` compares a before/after pair and strips every
 * DON!! whose area changed from runtime effect targets. Areas: each player's
 * cost area, DON!! deck, and — for given DON!! — the host's Leader,
 * Character or Stage area on that player's field. It runs at the
 * engine's step boundaries — each effect action, each cost payment, and each
 * pipeline execute step — so a DON!! that leaves and later re-enters the cost
 * area within one pipeline action (DON!! −X then "add DON!! from the deck")
 * is still released at the step where it left.
 */

import type { CardInstance, GameState } from "../types.js";

type DonArea = string;

function donAreas(state: GameState): Map<string, DonArea> {
  const areas = new Map<string, DonArea>();
  state.players.forEach((player, pi) => {
    for (const don of player.donCostArea) areas.set(don.instanceId, `cost:${pi}`);
    for (const don of player.donDeck) areas.set(don.instanceId, `deck:${pi}`);
    // Attached DON!! are keyed by the rules area of their host — each player
    // has one Leader area and one Character area (rules 3-1-1 / 3-1-3) — not
    // by the host card, so a DON!! moved between two of a player's Characters
    // stays in the same area and keeps its effects.
    const hosts: Array<[CardInstance | null, string]> = [
      [player.leader, "LEADER"],
      ...player.characters.map((c): [CardInstance | null, string] => [c, "CHARACTER"]),
      [player.stage, "STAGE"],
    ];
    for (const [card, area] of hosts) {
      if (!card) continue;
      for (const don of card.attachedDon) {
        areas.set(don.instanceId, `attached:${pi}:${area}`);
      }
    }
  });
  return areas;
}

/** DON!! ids whose area differs between `before` and `after`. */
export function movedDonIds(before: GameState, after: GameState): Set<string> {
  const moved = new Set<string>();
  if (before === after) return moved;
  const beforeAreas = donAreas(before);
  const afterAreas = donAreas(after);
  for (const [id, area] of beforeAreas) {
    if (afterAreas.get(id) !== area) moved.add(id);
  }
  return moved;
}

/** Remove the given DON!! ids from every runtime effect that targets by id. */
export function releaseDonEffects(
  state: GameState,
  donIds: ReadonlySet<string>,
): GameState {
  if (donIds.size === 0) return state;
  const touches = (appliesTo: readonly string[] | undefined) =>
    !!appliesTo?.some((id) => donIds.has(id));
  const prohibitionsTouched = state.prohibitions.some((p) => touches(p.appliesTo));
  const effectsTouched = state.activeEffects.some((e) => touches(e.appliesTo));
  if (!prohibitionsTouched && !effectsTouched) return state;
  return {
    ...state,
    prohibitions: prohibitionsTouched
      ? state.prohibitions.map((p) =>
          touches(p.appliesTo)
            ? { ...p, appliesTo: p.appliesTo.filter((id) => !donIds.has(id)) }
            : p,
        )
      : state.prohibitions,
    activeEffects: effectsTouched
      ? state.activeEffects.map((e) =>
          touches(e.appliesTo)
            ? { ...e, appliesTo: e.appliesTo.filter((id) => !donIds.has(id)) }
            : e,
        )
      : state.activeEffects,
  };
}

export function releaseMovedDonEffects(
  before: GameState,
  after: GameState,
): GameState {
  if (before === after) return after;
  if (
    !after.prohibitions.some((p) => p.appliesTo.length > 0) &&
    !after.activeEffects.some((e) => e.appliesTo.length > 0)
  ) {
    return after;
  }
  return releaseDonEffects(after, movedDonIds(before, after));
}
