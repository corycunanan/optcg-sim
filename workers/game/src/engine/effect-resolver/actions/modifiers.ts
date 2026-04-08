/**
 * Action handlers: MODIFY_POWER, MODIFY_COST, GRANT_KEYWORD, GRANT_ATTRIBUTE, NEGATE_EFFECTS,
 * SET_BASE_POWER, SET_POWER_TO_ZERO, COPY_POWER, SWAP_BASE_POWER
 */

import type { Action, EffectResult, RuntimeActiveEffect } from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { getActionParams } from "../../effect-types.js";
import { resolveAmount, computeExpiry } from "../action-utils.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { getEffectivePower } from "../../modifiers.js";
import { findCardInstance } from "../../state.js";
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

// ─── SET_BASE_POWER ──────────────────────────────────────────────────────────

export function executeSetBasePower(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const p = action.params ?? {};
  const value = resolveAmount(p.value as number | { type: string }, resultRefs, state, controller, cardDb);
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
    modifiers: [{ type: "SET_POWER" as any, params: { value }, duration }],
    duration,
    expiresAt: computeExpiry(duration, state),
    controller,
    appliesTo: targetIds,
    timestamp: Date.now(),
  };

  for (const id of targetIds) {
    events.push({ type: "POWER_MODIFIED", playerIndex: controller, payload: { targetInstanceId: id, value } });
  }

  return {
    state: { ...state, activeEffects: [...state.activeEffects, effect as any] },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}

// ─── SET_POWER_TO_ZERO ───────────────────────────────────────────────────────

export function executeSetPowerToZero(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const zeroAction = { ...action, params: { ...action.params, value: 0 } };
  return executeSetBasePower(state, zeroAction, sourceCardInstanceId, controller, cardDb, resultRefs, preselectedTargets);
}

// ─── COPY_POWER ──────────────────────────────────────────────────────────────

export function executeCopyPower(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  // Resolve source target (the card whose power we copy).
  // Schemas use either an explicit `source_target` object or a `source` string
  // shorthand ("OPPONENT_LEADER", "ATTACKING_CARD") that we convert here.
  let sourceIds: string[];
  const resolvedSource = resolveSourceTarget(params, state);

  if (resolvedSource?.directIds) {
    // String shorthand resolved to specific instance IDs — skip target resolver
    sourceIds = resolvedSource.directIds;
  } else if (resolvedSource?.target) {
    const sourceTarget = resolvedSource.target;
    const sourceValidIds = preselectedTargets ?? computeAllValidTargets(state, sourceTarget, controller, cardDb, sourceCardInstanceId, resultRefs);
    if (!preselectedTargets && needsPlayerTargetSelection(sourceTarget, sourceValidIds)) {
      return buildSelectTargetPrompt(state, action, sourceValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
    }
    sourceIds = autoSelectTargets(sourceTarget, sourceValidIds);
  } else {
    return { state, events, succeeded: false };
  }
  if (sourceIds.length === 0) return { state, events, succeeded: false };

  const sourceCard = findCardInstance(state, sourceIds[0]);
  const sourceData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  if (!sourceCard || !sourceData) return { state, events, succeeded: false };
  const sourcePower = getEffectivePower(sourceCard, sourceData, state, cardDb);

  // Apply copied power to self or action target
  const selfTarget = action.target ?? { type: "SELF" };
  const targetValidIds = computeAllValidTargets(state, selfTarget, controller, cardDb, sourceCardInstanceId, resultRefs);
  const targetIds = autoSelectTargets(selfTarget, targetValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const effect: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{ type: "SET_POWER" as any, params: { value: sourcePower }, duration }],
    duration,
    expiresAt: computeExpiry(duration, state),
    controller,
    appliesTo: targetIds,
    timestamp: Date.now(),
  };

  for (const id of targetIds) {
    events.push({ type: "POWER_MODIFIED", playerIndex: controller, payload: { targetInstanceId: id, value: sourcePower } });
  }

  return {
    state: { ...state, activeEffects: [...state.activeEffects, effect as any] },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}

type SourceResolution =
  | { directIds: string[]; target?: undefined }
  | { target: import("../../effect-types.js").Target; directIds?: undefined };

/**
 * Convert COPY_POWER `params.source` / `params.source_target` to either
 * direct instance IDs or a Target for the resolver. String shorthands
 * ("OPPONENT_LEADER", "ATTACKING_CARD") are handled here.
 */
function resolveSourceTarget(
  params: Record<string, unknown>,
  state: GameState,
): SourceResolution | undefined {
  // Explicit target object takes priority
  if (params.source_target) {
    return { target: params.source_target as import("../../effect-types.js").Target };
  }

  const source = params.source as string | Record<string, unknown> | undefined;
  if (!source) return undefined;

  // If source is already a target object (has a `type` key), use it directly
  if (typeof source === "object" && "type" in source) {
    return { target: source as import("../../effect-types.js").Target };
  }

  // String shorthands
  switch (source) {
    case "OPPONENT_LEADER":
      return { target: { type: "OPPONENT_LEADER" } as any };
    case "ATTACKING_CARD": {
      const battle = state.turn.battle;
      if (!battle) return undefined;
      return { directIds: [battle.attackerInstanceId] };
    }
    default:
      return undefined;
  }
}

// ─── SWAP_BASE_POWER ─────────────────────────────────────────────────────────

export function executeSwapBasePower(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length < 2) return { state, events, succeeded: false };

  const cardA = findCardInstance(state, targetIds[0]);
  const cardB = findCardInstance(state, targetIds[1]);
  const dataA = cardA ? cardDb.get(cardA.cardId) : undefined;
  const dataB = cardB ? cardDb.get(cardB.cardId) : undefined;
  if (!cardA || !cardB || !dataA || !dataB) return { state, events, succeeded: false };

  const powerA = getEffectivePower(cardA, dataA, state, cardDb);
  const powerB = getEffectivePower(cardB, dataB, state, cardDb);
  const expiry = computeExpiry(duration, state);

  const effectA: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{ type: "SET_POWER" as any, params: { value: powerB }, duration }],
    duration, expiresAt: expiry, controller,
    appliesTo: [targetIds[0]],
    timestamp: Date.now(),
  };
  const effectB: RuntimeActiveEffect = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{ type: "SET_POWER" as any, params: { value: powerA }, duration }],
    duration, expiresAt: expiry, controller,
    appliesTo: [targetIds[1]],
    timestamp: Date.now() + 1,
  };

  events.push(
    { type: "POWER_MODIFIED", playerIndex: controller, payload: { targetInstanceId: targetIds[0], value: powerB } },
    { type: "POWER_MODIFIED", playerIndex: controller, payload: { targetInstanceId: targetIds[1], value: powerA } },
  );

  return {
    state: { ...state, activeEffects: [...state.activeEffects, effectA as any, effectB as any] },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: 2 },
  };
}
