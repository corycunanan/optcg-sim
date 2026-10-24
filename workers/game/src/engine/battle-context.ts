import type { GameState } from "../types.js";
/** The cleared live battle is represented by its sole native8 completion owner. */
export function battleDurationContext(state: GameState): string {
  return (
    state.turn.battle?.battleId ??
    state.effectStack.find((frame) => frame.battleCompletion)?.battleCompletion
      ?.battleId ??
    ""
  );
}
