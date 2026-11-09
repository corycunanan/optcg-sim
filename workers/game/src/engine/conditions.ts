import type { Condition, EffectResult, TargetFilter } from "./effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import {
  cardTreatsAsAll,
  evaluateCondition as evaluateConditionQuery,
  hasBaseEffect,
  matchesFilter as matchesFilterQuery,
  type ConditionContext as QueryConditionContext,
  type ConditionQueryServices,
  type LastKnownFilterInfo,
} from "./condition-queries.js";
import {
  getEffectiveCostForRead,
  getEffectiveFieldCost,
  getEffectivePower,
  getEffectiveBasePower,
  getBattlePower,
  hasGrantedAttribute,
} from "./modifiers.js";
import { hasEffectiveKeyword } from "./keywords.js";

export type ConditionContext = Omit<QueryConditionContext, "queries">;

const conditionQueries: ConditionQueryServices = {
  getEffectivePower,
  getEffectiveBasePower,
  getEffectiveCostForRead,
  getEffectiveFieldCost,
  hasGrantedAttribute,
  hasEffectiveKeyword,
};
Object.freeze(conditionQueries);

// OPT-909: the same queries, except power reads include the Counter Step power
// the current battle added to its target (rules §7-1-3-2-1).
const battleConditionQueries: ConditionQueryServices = {
  ...conditionQueries,
  getEffectivePower: getBattlePower,
};
Object.freeze(battleConditionQueries);

export function evaluateCondition(
  state: GameState,
  condition: Condition,
  ctx: ConditionContext
): boolean {
  return evaluateConditionQuery(state, condition, {
    ...ctx,
    queries: conditionQueries,
  });
}

export function matchesFilter(
  card: CardInstance,
  filter: TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
  resultRefs?: Map<string, EffectResult>,
  costOverride?: number,
  filterController?: 0 | 1,
  lki?: LastKnownFilterInfo
): boolean {
  return matchesFilterQuery(
    card,
    filter,
    cardDb,
    state,
    resultRefs,
    costOverride,
    filterController,
    conditionQueries,
    lki
  );
}

/**
 * `matchesFilter` for a check made during a battle: the battle target's power
 * includes the Counter Step power added in that battle (OPT-909). Outside a
 * battle, or for any other card, it matches exactly like `matchesFilter`.
 */
export function matchesFilterInBattle(
  card: CardInstance,
  filter: TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
  filterController?: 0 | 1
): boolean {
  return matchesFilterQuery(
    card,
    filter,
    cardDb,
    state,
    undefined,
    undefined,
    filterController,
    battleConditionQueries
  );
}

export { cardTreatsAsAll, hasBaseEffect };
