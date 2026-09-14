import type { CardData, GameState, LifeCard } from "../types.js";

/** Resolve a proposed Life → Hand move before moving or offering a Trigger.
 * Kept separate from damage so effect actions and costs can share the policy.
 * Banish proposes Life → Trash and must not consult this replacement.
 */
export function lifeToHandDestination(
  state: GameState,
  owner: 0 | 1,
  lifeCard: LifeCard,
  cardDb: Map<string, CardData>
): "HAND" | "DECK_BOTTOM" | "TRASH" {
  if (lifeCard.face !== "UP") return "HAND";
  const leader = cardDb.get(state.players[owner].leader.cardId);
  for (const effect of leader?.effectSchema?.effects ?? []) {
    const rule = effect.rule;
    if (
      effect.category === "rule_modification" &&
      rule?.rule_type === "DAMAGE_RULE_MOD" &&
      rule.applies_to === "FACE_UP_LIFE" &&
      rule.instead_of === "HAND"
    )
      return rule.destination;
  }
  return "HAND";
}
