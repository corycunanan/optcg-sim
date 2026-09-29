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
 *
 * A release touches only effects that already existed at the start of its
 * span (matched by id): an effect applied after the move — e.g. "add a DON!!
 * rested, then hold your rested DON!!" — is not "previously applied".
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

/**
 * Remove the given DON!! ids from runtime effects that target by id.
 *
 * Only entries whose stable id is in `scope` are touched — the effects that
 * already existed before the move (rule 3-1-6-1 removes effects "previously
 * applied"). An entry created after the move, e.g. a hold applied to a DON!!
 * the same effect just added from the deck, keeps its targets.
 *
 * An entry whose `appliesTo` empties is dropped, mirroring
 * `stripOldIdentity` (zone-transition.ts): an empty list means "unrestricted"
 * to the prohibition and blocker matchers, so keeping it would widen it. An
 * active effect with a dynamic (non-SELF) modifier target and a prohibition
 * carrying a population `target` survive with an empty list, as there.
 */
export function releaseDonEffects(
  state: GameState,
  donIds: ReadonlySet<string>,
  scope: { prohibitionIds: ReadonlySet<string>; effectIds: ReadonlySet<string> },
): GameState {
  if (donIds.size === 0) return state;
  const touches = (id: string, inScope: ReadonlySet<string>, appliesTo: readonly string[]) =>
    inScope.has(id) && appliesTo.some((target) => donIds.has(target));
  const prohibitionsTouched = state.prohibitions.some((p) =>
    touches(p.id, scope.prohibitionIds, p.appliesTo));
  const effectsTouched = state.activeEffects.some((e) =>
    touches(e.id, scope.effectIds, e.appliesTo));
  if (!prohibitionsTouched && !effectsTouched) return state;
  return {
    ...state,
    prohibitions: prohibitionsTouched
      ? state.prohibitions.flatMap((p) => {
          if (!touches(p.id, scope.prohibitionIds, p.appliesTo)) return [p];
          const appliesTo = p.appliesTo.filter((id) => !donIds.has(id));
          return appliesTo.length > 0 || p.target ? [{ ...p, appliesTo }] : [];
        })
      : state.prohibitions,
    activeEffects: effectsTouched
      ? state.activeEffects.flatMap((e) => {
          if (!touches(e.id, scope.effectIds, e.appliesTo)) return [e];
          const appliesTo = e.appliesTo.filter((id) => !donIds.has(id));
          const dynamic = e.modifiers.some(
            (modifier) => modifier.target?.type !== undefined && modifier.target.type !== "SELF",
          );
          return appliesTo.length > 0 || dynamic ? [{ ...e, appliesTo }] : [];
        })
      : state.activeEffects,
  };
}

/**
 * Release every DON!! whose area differs between `before` and `after`, from
 * the effects that already existed in `before` (matched by id).
 */
export function releaseMovedDonEffects(
  before: GameState,
  after: GameState,
): GameState {
  if (before === after) return after;
  const heldBefore =
    before.prohibitions.some((p) => p.appliesTo.length > 0) ||
    before.activeEffects.some((e) => e.appliesTo.length > 0);
  if (!heldBefore) return after;
  return releaseDonEffects(after, movedDonIds(before, after), {
    prohibitionIds: new Set(before.prohibitions.map((p) => p.id)),
    effectIds: new Set(before.activeEffects.map((e) => e.id)),
  });
}
