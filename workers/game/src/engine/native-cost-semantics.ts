import type { GameState } from "../types.js";
/** Battle completion does not migrate existing COST semantics. Native8 must
 * explicitly retain the deployed6 or native7 provenance of its producer. */
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
