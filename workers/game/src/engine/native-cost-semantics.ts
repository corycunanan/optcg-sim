import type { GameState } from "../types.js";
/** Battle completion does not migrate existing COST semantics. Native8 must
 * explicitly retain the deployed6 or native7 provenance of its producer. */
export function hasNativeCostSemantics(
  state: Pick<GameState, "schemaVersion" | "costSemanticsVersion">
): boolean {
  return (
    state.schemaVersion === 7 ||
    (state.schemaVersion === 8 && state.costSemanticsVersion === 7)
  );
}
