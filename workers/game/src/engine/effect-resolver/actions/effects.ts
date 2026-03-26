/**
 * Action handlers: APPLY_PROHIBITION, APPLY_ONE_TIME_MODIFIER, SCHEDULE_ACTION
 */

import type {
  Action,
  EffectResult,
} from "../../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../../types.js";
import type { ActionResult } from "../types.js";
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
  const allValidIds = preselectedTargets ?? computeAllValidTargets(state, action.target, controller, cardDb, sourceCardInstanceId, resultRefs);
  if (!preselectedTargets && needsPlayerTargetSelection(action.target, allValidIds)) {
    return buildSelectTargetPrompt(state, action, allValidIds, sourceCardInstanceId, controller, cardDb, resultRefs);
  }
  const targetIds = autoSelectTargets(action.target, allValidIds);

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
