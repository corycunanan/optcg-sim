import type { GameState } from "../types.js";
/** Native transaction/identity ownership is shared by modes7, 8 and9. The v8
 * envelope records its cost capability explicitly; loading never upgrades it. */
export function hasNativeCostSemantics(
  state: Pick<GameState, "schemaVersion" | "costSemanticsVersion">
): boolean {
  return (
    state.schemaVersion === 7 ||
    ((state.schemaVersion === 8 || state.schemaVersion === 9 || (state.schemaVersion === 10 || state.schemaVersion === 11)) && (state.costSemanticsVersion === 7 || state.costSemanticsVersion === 8 || state.costSemanticsVersion === 9))
  );
}

/** Mode8 is game-wide admission semantics, including fresh downstream effects.
 * Mode9 keeps every mode8 rule. Keep this separate from native
 * transaction/continuation support (mode7+). */
export function hasStructuralCostSemantics(
  state: Pick<GameState, "schemaVersion" | "costSemanticsVersion">
): boolean {
  return (state.schemaVersion === 8 || state.schemaVersion === 9 || (state.schemaVersion === 10 || state.schemaVersion === 11)) && (state.costSemanticsVersion === 8 || state.costSemanticsVersion === 9);
}

/** OPT-958, mode9 only: a printed activation cost replaced after payment has
 * started keeps the portion already paid (8-3-1-3-1) and spends the
 * [Once Per Turn] use (10-2-13-5, read as covering a replaced cost the way the
 * Life-cost replacement path already does); the effect after the colon is not
 * processed (8-3-1-7). The cost-exit replacement is offered on the staged
 * payment state instead of the activation baseline. Modes6–8 keep Decision 10
 * rollback: games recorded under them never change behavior mid-game. */
export function retainsReplacedCostPrefix(
  state: Pick<GameState, "schemaVersion" | "costSemanticsVersion">
): boolean {
  return (state.schemaVersion === 8 || state.schemaVersion === 9 || state.schemaVersion === 10 || state.schemaVersion === 11) &&
    state.costSemanticsVersion === 9;
}
