import type { GameState } from "../types.js";
/** Native transaction/identity ownership is shared by modes7 and8. The v8
 * envelope records its cost capability explicitly; loading never upgrades it. */
export function hasNativeCostSemantics(
  state: Pick<GameState, "schemaVersion" | "costSemanticsVersion">
): boolean {
  return (
    state.schemaVersion === 7 ||
    (state.schemaVersion === 8 && (state.costSemanticsVersion === 7 || state.costSemanticsVersion === 8))
  );
}

/** Mode8 is game-wide admission semantics, including fresh downstream effects.
 * Keep this separate from native transaction/continuation support (mode7+). */
export function hasStructuralCostSemantics(
  state: Pick<GameState, "schemaVersion" | "costSemanticsVersion">
): boolean {
  return state.schemaVersion === 8 && state.costSemanticsVersion === 8;
}
