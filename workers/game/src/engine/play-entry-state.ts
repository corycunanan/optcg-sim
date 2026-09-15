import type { CardState } from "./effect-types.js";
import type { CardData, GameState } from "../types.js";

/** Resolve entry once the played card and its controller are known. Explicit
 * effect instructions take precedence over the Leader's default play rule.
 * Entry rested is not a rest-by-effect event (OP09-022 official FAQ). */
export function getPlayEntryState(
  state: GameState,
  controller: 0 | 1,
  card: CardData,
  cardDb: Map<string, CardData>,
  explicitEntryState?: CardState
): CardState {
  if (explicitEntryState) return explicitEntryState;
  const leader = state.players[controller].leader;
  const effects = cardDb.get(leader.cardId)?.effectSchema?.effects ?? [];
  for (const effect of effects) {
    if (effect.category !== "rule_modification") continue;
    const rule = effect.rule;
    if (
      rule?.rule_type === "PLAY_STATE_MOD" &&
      rule.card_type === card.type.toUpperCase()
    ) {
      return rule.entry_state;
    }
  }
  return "ACTIVE";
}
