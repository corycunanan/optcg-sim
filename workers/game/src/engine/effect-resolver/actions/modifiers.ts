/**
 * Action handlers: MODIFY_POWER, MODIFY_COST, GRANT_KEYWORD, GRANT_ATTRIBUTE, NEGATE_EFFECTS
 */

import type { Action, EffectResult, RuntimeActiveEffect } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { getActionParams } from "../../effect-types.js";
import { resolveAmount, computeExpiry } from "../action-utils.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { nanoid } from "../../../util/nanoid.js";

export function executeModifyPower(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "MODIFY_POWER");
  const amount = resolveAmount(p.amount as number | { type: string }, resultRefs, state, controller, cardDb);
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const effect: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "MODIFY_POWER",
      params: { amount },
      duration,
    }],
    duration,
    expiresAt: computeExpiry(duration, state),
    controller,
    appliesTo: targetIds,
    timestamp: Date.now(),
  };

  const newActiveEffects = [...state.activeEffects, effect as any];

  for (const id of targetIds) {
    events.push({
      type: "POWER_MODIFIED",
      playerIndex: controller,
      payload: { targetInstanceId: id, amount },
    });
  }

  return {
    state: { ...state, activeEffects: newActiveEffects },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}

export function executeModifyCost(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "MODIFY_COST");
  const amount = resolveAmount(p.amount as number | { type: string }, resultRefs, state, controller, cardDb);
  const duration = action.duration ?? { type: "THIS_TURN" as const };
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const effect: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "MODIFY_COST",
      params: { amount },
      duration,
    }],
    duration,
    expiresAt: computeExpiry(duration, state),
    controller,
    appliesTo: targetIds,
    timestamp: Date.now(),
  };

  return {
    state: { ...state, activeEffects: [...state.activeEffects, effect as any] },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}

export function executeGrantKeyword(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "GRANT_KEYWORD");
  const keyword = p.keyword;
  const duration = action.duration ?? { type: "THIS_TURN" as const };
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const effect: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "GRANT_KEYWORD",
      params: { keyword },
      duration,
    }],
    duration,
    expiresAt: computeExpiry(duration, state),
    controller,
    appliesTo: targetIds,
    timestamp: Date.now(),
  };

  return {
    state: { ...state, activeEffects: [...state.activeEffects, effect as any] },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}

export function executeGrantAttribute(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const p = getActionParams(action, "GRANT_ATTRIBUTE");
  const attribute = p.attribute;
  const duration = action.duration ?? { type: "THIS_TURN" as const };
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const effect: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{
      type: "GRANT_ATTRIBUTE" as any,
      params: { attribute },
      duration,
    }],
    duration,
    expiresAt: computeExpiry(duration, state),
    controller,
    appliesTo: targetIds,
    timestamp: Date.now(),
  };

  return {
    state: { ...state, activeEffects: [...state.activeEffects, effect as any] },
    events,
    succeeded: true,
  };
}

export function executeNegateEffects(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  // Remove all active effects sourced by negated cards
  const negatedSet = new Set(targetIds);
  const newActiveEffects = state.activeEffects.filter(
    (e) => !negatedSet.has((e as any).sourceCardInstanceId),
  );

  events.push({
    type: "EFFECTS_NEGATED",
    playerIndex: controller,
    payload: { targetInstanceIds: targetIds },
  });

  return {
    state: { ...state, activeEffects: newActiveEffects },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}
