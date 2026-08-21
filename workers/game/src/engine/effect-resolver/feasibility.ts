/** Pure, non-mutating feasibility checks for explicitly constrained actions. */

import type { Action, EffectResult } from "../effect-types.js";
import type { CardData, GameState } from "../../types.js";
import { computeAllValidTargets } from "./target-resolver.js";

function hasFullTargetCount(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): boolean {
  const count = action.target?.count;
  if (!action.target || !count) return false;
  const validTargets = computeAllValidTargets(
    state,
    action.target,
    controller,
    cardDb,
    sourceCardInstanceId,
    resultRefs,
  );
  if ("exact" in count) return validTargets.length >= count.exact;
  if ("all" in count || "any_number" in count || "up_to" in count) return true;
  return false;
}

export function isActionFeasible(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): boolean {
  if (action.requires?.type === "FULL_TARGET_COUNT") {
    return hasFullTargetCount(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
    );
  }

  if (action.type === "OPPONENT_ACTION" && action.params?.action) {
    const opponent: 0 | 1 = controller === 0 ? 1 : 0;
    return isActionFeasible(
      state,
      action.params.action,
      sourceCardInstanceId,
      opponent,
      cardDb,
      resultRefs,
    );
  }

  return true;
}

export function isActionBranchFeasible(
  state: GameState,
  actions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): boolean {
  return actions.every((action) =>
    isActionFeasible(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
    ),
  );
}
