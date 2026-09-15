import type { Action, EffectResult, EffectBlock } from "../effect-types.js";
import type { CardData, GameState, PendingEvent } from "../../types.js";
import {
  CONTINUATION_EFFECT_BLOCK,
  generateFrameId,
  pushFrame,
  popFrame,
} from "../effect-stack.js";
import { isEngineTerminated } from "../engine-limits.js";
import type { ActionResult, EffectResolverServices } from "./types.js";

/** A notification is future work, not a committed accumulator: nested costs and
 * prompts may publish their prefixes without publishing this activation early. */
export function resolveActivatedEvent(
  state: GameState,
  block: EffectBlock,
  eventInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  notification: PendingEvent,
  services: EffectResolverServices
): ActionResult {
  const generated = generateFrameId(state);
  const withCompletion = pushFrame(generated.state, {
    id: generated.id,
    sourceCardInstanceId: eventInstanceId,
    controller,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    eventActivationCompletion: notification,
  });
  if (isEngineTerminated(withCompletion))
    return { state: withCompletion, events: [], succeeded: false };
  const resolved = services.resolveEffect(
    withCompletion,
    block,
    eventInstanceId,
    controller,
    cardDb
  );
  const result = { targetInstanceIds: [eventInstanceId], count: 1 };
  if (resolved.pendingPrompt)
    return {
      state: resolved.state,
      events: resolved.events,
      succeeded: true,
      result,
      pendingPrompt: resolved.pendingPrompt,
      nestedEventActivation: true,
    };
  if (isEngineTerminated(resolved.state))
    return { state: resolved.state, events: resolved.events, succeeded: false };
  return {
    state: popFrame(resolved.state),
    events: [...resolved.events, notification],
    succeeded: true,
    result,
  };
}

/** Preserve the parent's source/controller and result independently of its
 * selected Event. The Event's completion and all children stay above it. */
export function retainEventParent(
  state: GameState,
  childStart: number,
  action: Action,
  remainingActions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  resultRefs: Map<string, EffectResult>,
  result: ActionResult,
  events: PendingEvent[],
  effectDescription?: string
): GameState {
  if (action.result_ref && result.result)
    resultRefs.set(action.result_ref, result.result);
  const generated = generateFrameId(state);
  const pushed = pushFrame(generated.state, {
    id: generated.id,
    sourceCardInstanceId,
    controller,
    effectDescription,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: action,
    remainingActions,
    resultRefs: [...resultRefs],
    validTargets: [],
    priorActionSucceeded: result.succeeded,
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
  });
  if (isEngineTerminated(pushed)) return pushed;
  const parent = pushed.effectStack.at(-1)!;
  const childEvents = new Set(
    state.effectStack
      .slice(childStart)
      .flatMap((frame) => frame.accumulatedEvents)
  );
  parent.accumulatedEvents = events.filter((event) => !childEvents.has(event));
  return {
    ...pushed,
    effectStack: [
      ...state.effectStack.slice(0, childStart),
      parent,
      ...state.effectStack.slice(childStart),
    ],
  };
}
