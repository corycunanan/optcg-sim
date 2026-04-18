/**
 * Action handlers: APPLY_PROHIBITION, APPLY_ONE_TIME_MODIFIER, SCHEDULE_ACTION,
 * SET_COST, WIN_GAME, NEGATE_TRIGGER_TYPE, EXTRA_TURN
 */

import type {
  Action,
  EffectResult,
  RuntimeActiveEffect,
} from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
import { resolveAmount, computeExpiry } from "../action-utils.js";
import { computeAllValidTargets, autoSelectTargets, needsPlayerTargetSelection, buildSelectTargetPrompt } from "../target-resolver.js";
import { nanoid } from "../../../util/nanoid.js";

export function executeApplyProhibition(
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
  const prohibType = params.prohibition_type as string;
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

  const prohibition: import("../../effect-types.js").RuntimeProhibition = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    prohibitionType: prohibType as any,
    scope: params.scope as any ?? {},
    duration,
    controller,
    appliesTo: targetIds,
    usesRemaining: null,
    conditionalOverride: params.conditional_override as any,
  };

  return {
    state: { ...state, prohibitions: [...state.prohibitions, prohibition as any] },
    events,
    succeeded: true,
  };
}

export function executeScheduleAction(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const timing = (params.timing as string) ?? "END_OF_THIS_TURN";
  const scheduledAction = params.action as Action;
  const boundTo = params.bound_to as string | null ?? null;

  const entry: import("../../effect-types.js").RuntimeScheduledAction = {
    id: nanoid(),
    timing: timing as any,
    action: scheduledAction,
    boundToInstanceId: boundTo,
    sourceEffectId: sourceCardInstanceId,
    controller,
  };

  return {
    state: { ...state, scheduledActions: [...state.scheduledActions, entry as any] },
    events,
    succeeded: true,
  };
}

export function executeApplyOneTimeModifier(
  state: GameState,
  action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const modification = params.modification as import("../../effect-types.js").Modifier;
  const appliesTo = params.applies_to as { action: string; filter?: import("../../effect-types.js").TargetFilter };
  const expires = action.duration ?? { type: "THIS_TURN" as const };

  if (!modification || !appliesTo) return { state, events, succeeded: false };

  const otm: import("../../effect-types.js").RuntimeOneTimeModifier = {
    id: nanoid(),
    appliesTo: appliesTo as any,
    modification,
    expires,
    consumed: false,
    controller,
  };

  return {
    state: { ...state, oneTimeModifiers: [...state.oneTimeModifiers, otm as any] },
    events,
    succeeded: true,
  };
}

// ─── SET_COST ────────────────────────────────────────────────────────────────

export function executeSetCost(
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
  const value = resolveAmount(params.value as number | { type: string }, resultRefs, state, controller, cardDb);
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
    modifiers: [{ type: "SET_COST" as any, params: { value }, duration }],
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

// ─── WIN_GAME ────────────────────────────────────────────────────────────────

export function executeWinGame(
  state: GameState,
  _action: Action,
  _sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  events.push({ type: "GAME_OVER", playerIndex: controller, payload: { reason: "card_effect" } });

  return {
    state: { ...state, status: "FINISHED" as any, winner: controller },
    events,
    succeeded: true,
  };
}

// ─── NEGATE_TRIGGER_TYPE ─────────────────────────────────────────────────────

export function executeNegateTriggerType(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  _cardDb: Map<string, CardData>,
  _resultRefs: Map<string, EffectResult>,
): ActionResult {
  const events: PendingEvent[] = [];
  const params = action.params ?? {};
  const triggerType = params.trigger_type as import("../../effect-types.js").KeywordTriggerType;
  const affectedController = params.affected_controller as string ?? "OPPONENT";
  const duration = action.duration ?? { type: "THIS_TURN" as const };

  // Map trigger type to prohibition type. The prohibitionType is informational
  // here — OPT-260 wires trigger-type negation through the scope.triggerType
  // check in matchTriggersForEvent, so any non-null trigger-type prohibition
  // is consumed by its scope, not by its type.
  const prohibMap: Record<string, string> = {
    "ON_PLAY": "CANNOT_ACTIVATE_ON_PLAY",
    "WHEN_ATTACKING": "CANNOT_ACTIVATE_EFFECT",
    "ON_KO": "CANNOT_ACTIVATE_EFFECT",
    "BLOCKER": "CANNOT_ACTIVATE_BLOCKER",
  };
  const prohibType = prohibMap[triggerType] ?? "CANNOT_ACTIVATE_EFFECT";

  const targetController = affectedController === "OPPONENT" ? (controller === 0 ? 1 : 0) : controller;

  const prohibition: import("../../effect-types.js").RuntimeProhibition = {
    id: nanoid(),
    sourceCardInstanceId,
    sourceEffectBlockId: "",
    prohibitionType: prohibType as any,
    scope: { triggerType },
    duration,
    controller: targetController as 0 | 1,
    appliesTo: [],
    usesRemaining: null,
  };

  return {
    state: { ...state, prohibitions: [...state.prohibitions, prohibition as any] },
    events,
    succeeded: true,
  };
}

// ─── EXTRA_TURN ──────────────────────────────────────────────────────────────

export function executeExtraTurn(
  state: GameState,
  _action: Action,
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

  events.push({ type: "EXTRA_TURN_GRANTED", playerIndex: state.turn.activePlayerIndex as 0 | 1, payload: {} });

  return {
    state: { ...state, turn: newTurn },
    events,
    succeeded: true,
  };
}
