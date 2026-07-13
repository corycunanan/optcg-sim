import type { CardData, GameState } from "../types.js";
import { isEffectConditionMet } from "../engine/modifiers.js";
import { filterStateForPlayer } from "../engine/state.js";

/** Remove display-only active effects whose WHILE condition is not met. */
export function stripInactiveEffects(
  state: GameState,
  cardDb: Map<string, CardData>
): GameState {
  const effects = state.activeEffects;
  const active = effects.filter((effect) =>
    isEffectConditionMet(effect, state, cardDb)
  );
  return active.length === state.activeEffects.length
    ? state
    : { ...state, activeEffects: active };
}

/** Build the only state representation allowed to cross the socket boundary. */
export function visibleStateForPlayer(
  state: GameState,
  cardDb: Map<string, CardData>,
  playerIndex: 0 | 1
): GameState {
  return filterStateForPlayer(stripInactiveEffects(state, cardDb), playerIndex);
}
