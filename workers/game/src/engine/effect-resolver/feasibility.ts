/** Pure, non-mutating feasibility checks for explicitly constrained actions. */

import type { Action, EffectResult } from "../effect-types.js";
import type { CardData, GameState } from "../../types.js";
import { computeAllValidTargets } from "./target-resolver.js";
import { lifeToHandAddsNothing } from "./actions/life.js";

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

/**
 * Target types that name one fixed card from the effect's context rather than
 * a pool the player picks from. Empty means the referenced card is gone
 * (Rule 3-1-6), and nothing else can stand in for it.
 */
const FIXED_REFERENCE_TARGETS: ReadonlySet<string> = new Set([
  "BATTLE_TARGET",
  "TRIGGERING_CARD",
  "TRIGGERING_CARD_IN_TRASH",
  "REPLACED_CARD",
]);

/**
 * OPT-904: true when an action chain can have no effect at all: its first
 * action acts on a fixed context reference that resolves to nothing, and
 * every later action is an IF_DO that depends on it ("you may K.O. the
 * Character you battled with. If you do, …"). An optional block with such a
 * chain and no cost is not offered, since accepting could change nothing.
 */
export function isFixedReferenceChainVacuous(
  state: GameState,
  actions: readonly Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): boolean {
  const [first, ...rest] = actions;
  const target = first?.target;
  if (!first || !target?.type || first.target_ref) return false;
  if (!FIXED_REFERENCE_TARGETS.has(target.type)) return false;
  if (target.mixed_pool || target.dual_targets?.length) return false;
  if (!rest.every((action) => action.chain === "IF_DO")) return false;
  return computeAllValidTargets(
    state,
    target,
    controller,
    cardDb,
    sourceCardInstanceId,
    resultRefs,
  ).length === 0;
}

/**
 * OPT-1037: true when accepting an action-level `optional` ("Then, you may
 * add 1 card from the top or bottom of your Life cards to your hand") would
 * reach the action handler's own no-op path, so the "you may" offers no real
 * choice (rule 1-3-2). The resolver then treats the clause as declined
 * without a prompt: a following IF_DO does not run. Each entry mirrors the
 * handler's early return exactly, so skipping and declining agree.
 */
export function isOptionalActionVacuous(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): boolean {
  switch (action.type) {
    case "LIFE_TO_HAND":
      return lifeToHandAddsNothing(
        state,
        action,
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs,
      );
    default:
      return false;
  }
}
