import type { Condition, EffectResult, TargetFilter } from "./effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import {
  cardTreatsAsAll,
  evaluateCondition as evaluateConditionQuery,
  hasBaseEffect,
  matchesFilter as matchesFilterQuery,
  type ConditionContext as QueryConditionContext,
  type ConditionQueryServices,
} from "./condition-queries.js";
import {
  getEffectiveCostForRead,
  getEffectiveFieldCost,
  getEffectivePower,
  getEffectiveBasePower,
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
  basePowerOverride?: number
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
    basePowerOverride
  );
}

export { cardTreatsAsAll, hasBaseEffect };
