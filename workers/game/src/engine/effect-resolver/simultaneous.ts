import type { Action, ActionType, EffectResult } from "../effect-types.js";
import type { CardData, GameState } from "../../types.js";
import { evaluateCondition, type ConditionContext } from "../conditions.js";
import { resolveAmount } from "./action-utils.js";
import {
  autoSelectTargets,
  computeAllValidTargets,
  needsPlayerTargetSelection,
} from "./target-resolver.js";

/**
 * Actions whose handlers are safe to commit inside an AND transaction.
 *
 * These handlers only mutate their declared, pre-lockable targets and never
 * open replacement, trigger-drain, arrange, or nested-choice continuations.
 * New action types must prove that contract with a resolver regression before
 * being added here; schema validation rejects every other authored AND group.
 */
export const SIMULTANEOUS_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  "MODIFY_POWER",
  "MODIFY_COST",
  "GRANT_KEYWORD",
  "GRANT_ATTRIBUTE",
  "NEGATE_EFFECTS",
  "SET_BASE_POWER",
  "SET_POWER_TO_ZERO",
  "SET_ACTIVE",
  "APPLY_PROHIBITION",
]);

export interface SimultaneousActionLock {
  execute: boolean;
  /** Undefined only when the action has no target. Empty means target-locked to none. */
  targetInstanceIds?: string[];
}

export interface SimultaneousGroupPlan {
  actions: Action[];
  locks: SimultaneousActionLock[];
  nextActionIndex: number;
  followingActions: Action[];
  resultRefs: [string, unknown][];
  effectDescription?: string;
}

export interface SimultaneousSelectionRequest {
  actionIndex: number;
  action: Action;
  validTargetIds: string[];
}

export interface SimultaneousPlanningResult {
  plan: SimultaneousGroupPlan;
  selection?: SimultaneousSelectionRequest;
}

function lockDynamicActionValues(
  action: Action,
  state: GameState,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): Action {
  const field = action.type === "SET_BASE_POWER"
    ? "value"
    : action.type === "MODIFY_POWER" || action.type === "MODIFY_COST"
      ? "amount"
      : null;
  if (!field || typeof action.params?.[field] === "number") return action;
  return {
    ...action,
    params: {
      ...action.params,
      [field]: resolveAmount(
        action.params?.[field] as number | { type: string } | undefined,
        resultRefs,
        state,
        controller,
        cardDb,
      ),
    },
  };
}

/**
 * Lock conditions and target eligibility against one immutable group-start
 * snapshot. No action handler runs until every required choice is recorded.
 */
export function planSimultaneousGroup(
  state: GameState,
  plan: SimultaneousGroupPlan,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): SimultaneousPlanningResult {
  const resultRefs = new Map<string, EffectResult>(
    plan.resultRefs.map(([key, value]) => [key, value as EffectResult]),
  );
  const locks = [...plan.locks];
  const actions = [...plan.actions];

  for (let i = plan.nextActionIndex; i < plan.actions.length; i++) {
    const action = lockDynamicActionValues(
      actions[i],
      state,
      controller,
      cardDb,
      resultRefs,
    );
    actions[i] = action;
    const conditionContext: ConditionContext = {
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
    };
    if (action.conditions && !evaluateCondition(state, action.conditions, conditionContext)) {
      locks[i] = { execute: false };
      continue;
    }

    let allValidIds: string[] | undefined;
    if (action.target_ref) {
      allValidIds = resultRefs.get(action.target_ref)?.targetInstanceIds ?? [];
    } else if (action.target) {
      allValidIds = computeAllValidTargets(
        state,
        action.target,
        controller,
        cardDb,
        sourceCardInstanceId,
        resultRefs,
      );
    }

    if (allValidIds && needsPlayerTargetSelection(action.target, allValidIds)) {
      return {
        plan: { ...plan, actions, locks, nextActionIndex: i },
        selection: { actionIndex: i, action, validTargetIds: allValidIds },
      };
    }

    locks[i] = {
      execute: true,
      ...(allValidIds ? { targetInstanceIds: autoSelectTargets(action.target, allValidIds) } : {}),
    };
  }

  return {
    plan: { ...plan, actions, locks, nextActionIndex: plan.actions.length },
  };
}

export function isSimultaneousGroupStart(actions: Action[], index: number): boolean {
  return index + 1 < actions.length && actions[index + 1].chain === "AND";
}

export function simultaneousGroupEnd(actions: Action[], startIndex: number): number {
  let end = startIndex;
  while (end + 1 < actions.length && actions[end + 1].chain === "AND") end++;
  return end;
}
