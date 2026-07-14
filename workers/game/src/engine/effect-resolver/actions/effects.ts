/**
 * Action handlers: APPLY_PROHIBITION, APPLY_ONE_TIME_MODIFIER, SCHEDULE_ACTION,
 * SET_COST, WIN_GAME, NEGATE_TRIGGER_TYPE, EXTRA_TURN
 */

import type {
  ActionOf,
  EffectResult,
  ProhibitionType,
  RuntimeActiveEffect,
  RuntimeOneTimeModifier,
  RuntimeProhibition,
  RuntimeScheduledAction,
} from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import {
  resolveAmount,
  computeExpiry,
  computeProhibitionExpiry,
  getActionParams,
} from "../action-utils.js";
import {
  computeAllValidTargets,
  autoSelectTargets,
  needsPlayerTargetSelection,
  buildSelectTargetPrompt,
} from "../target-resolver.js";
import {
  allocateEngineId,
  allocateEngineRecord,
} from "../../execution-context.js";

export function executeApplyProhibition(
  state: GameState,
  action: ActionOf<"APPLY_PROHIBITION">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = getActionParams(action, "APPLY_PROHIBITION");
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  // Player-level prohibitions (e.g., CANNOT_PLAY_FROM_HAND) have no card targets;
  // they bind to the controller via scope.controller. Skip target resolution when
  // action.target is omitted.
  let targetIds: string[] = [];
  if (action.target) {
    const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
    if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
      return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
    }
    targetIds = autoSelectTargets(action.target, allValidIds);
  }

  const allocated = allocateEngineId(state, "prohibition");
  const prohibition: RuntimeProhibition = {
    id: allocated.id,
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    prohibitionType: params.prohibition_type,
    scope: params.scope ?? {},
    duration,
    expiresAt: computeProhibitionExpiry(duration, state, controller),
    controller,
    appliesTo: targetIds,
    usesRemaining: null,
    conditionalOverride: params.conditional_override,
  };

  return {
    state: {
      ...allocated.state,
      prohibitions: [...state.prohibitions, prohibition],
    },
    events,
    succeeded: true,
  };
}

export function executeScheduleAction(
  state: GameState,
  action: ActionOf<"SCHEDULE_ACTION">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = getActionParams(action, "SCHEDULE_ACTION");

  const allocated = allocateEngineId(state, "scheduled-action");
  const entry: RuntimeScheduledAction = {
    id: allocated.id,
    timing: params.timing ?? "END_OF_THIS_TURN",
    action: params.action,
    boundToInstanceId: params.bound_to ?? null,
    sourceEffectId: sourceCardInstanceId,
    controller,
  };

  return {
    state: {
      ...allocated.state,
      scheduledActions: [...state.scheduledActions, entry],
    },
    events,
    succeeded: true,
  };
}

export function executeApplyOneTimeModifier(
  state: GameState,
  action: ActionOf<"APPLY_ONE_TIME_MODIFIER">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = getActionParams(action, "APPLY_ONE_TIME_MODIFIER");
  const expires = action.duration ?? { type: "THIS_TURN" as const };

  if (!params.modification || !params.applies_to)
    return { state, events, succeeded: false };

  const allocated = allocateEngineId(state, "one-time-modifier");
  const otm: RuntimeOneTimeModifier = {
    id: allocated.id,
    appliesTo: params.applies_to,
    modification: params.modification,
    expires,
    consumed: false,
    controller,
  };

  return {
    state: {
      ...allocated.state,
      oneTimeModifiers: [...state.oneTimeModifiers, otm],
    },
    events,
    succeeded: true,
  };
}

// ─── SET_COST ────────────────────────────────────────────────────────────────

export function executeSetCost(
  state: GameState,
  action: ActionOf<"SET_COST">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const events: PendingEvent[] = [];
  const params = getActionParams(action, "SET_COST");
  const value = resolveAmount(
    params.value,
    resultRefs,
    state,
    controller,
    cardDb
  );
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);
  if (targetIds.length === 0) return { state, events, succeeded: false };

  const allocated = allocateEngineRecord(state, "active-effect");
  const effect: RuntimeActiveEffect = {
    id: allocated.id,
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [{ type: "SET_COST", params: { value }, duration }],
    duration,
    expiresAt: computeExpiry(duration, state, controller),
    controller,
    appliesTo: targetIds,
    timestamp: allocated.timestamp,
  };

  return {
    state: {
      ...allocated.state,
      activeEffects: [...state.activeEffects, effect],
    },
    events,
    succeeded: true,
    result: { targetInstanceIds: targetIds, count: targetIds.length },
  };
}

// ─── WIN_GAME ────────────────────────────────────────────────────────────────

export function executeWinGame(
  state: GameState,
  _action: ActionOf<"WIN_GAME">,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  events.push({ type: "GAME_OVER", playerIndex: controller, payload: { reason: "card_effect" } });

  return {
    state: { ...state, status: "FINISHED", winner: controller },
    events,
    succeeded: true,
  };
}

// ─── NEGATE_TRIGGER_TYPE ─────────────────────────────────────────────────────

export function executeNegateTriggerType(
  state: GameState,
  action: ActionOf<"NEGATE_TRIGGER_TYPE">,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = getActionParams(action, "NEGATE_TRIGGER_TYPE");
  const triggerType = params.trigger_type;
  const affectedController = params.affected_controller ?? "OPPONENT";
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  // Map trigger type to prohibition type. The prohibitionType is informational
  // here — OPT-260 wires trigger-type negation through the scope.triggerType
  // check in matchTriggersForEvent, so any non-null trigger-type prohibition
  // is consumed by its scope, not by its type.
  const prohibMap: Partial<Record<typeof triggerType, ProhibitionType>> = {
    ON_PLAY: "CANNOT_ACTIVATE_ON_PLAY",
    WHEN_ATTACKING: "CANNOT_ACTIVATE_EFFECT",
    ON_KO: "CANNOT_ACTIVATE_EFFECT",
  };
  const prohibType = prohibMap[triggerType] ?? "CANNOT_ACTIVATE_EFFECT";

  const targetController = affectedController === "OPPONENT" ? (controller === 0 ? 1 : 0) : controller;

  const allocated = allocateEngineId(state, "prohibition");
  const prohibition: RuntimeProhibition = {
    id: allocated.id,
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    prohibitionType: prohibType,
    scope: { triggerType },
    duration,
    // Anchor expiry to the caster ("your ... turn" in card text), not the
    // affected player stored in `controller`.
    expiresAt: computeProhibitionExpiry(duration, state, controller),
    controller: targetController,
    appliesTo: [],
    usesRemaining: null,
  };

  return {
    state: {
      ...allocated.state,
      prohibitions: [...state.prohibitions, prohibition],
    },
    events,
    succeeded: true,
  };
}

// ─── EXTRA_TURN ──────────────────────────────────────────────────────────────

export function executeExtraTurn(
  state: GameState,
  _action: ActionOf<"EXTRA_TURN">,
  _sourceCardInstanceId: string,
  _controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const newTurn = {
    ...state.turn,
    extraTurnsPending: (state.turn.extraTurnsPending ?? 0) + 1,
  };

  events.push({
    type: "EXTRA_TURN_GRANTED",
    playerIndex: state.turn.activePlayerIndex,
    payload: {},
  });

  return {
    state: { ...state, turn: newTurn },
    events,
    succeeded: true,
  };
}
