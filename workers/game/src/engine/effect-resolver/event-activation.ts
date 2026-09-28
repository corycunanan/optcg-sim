import type { Action, EffectResult, EffectBlock } from "../effect-types.js";
import type {
  CardData,
  EffectStackFrame,
  GameState,
  PendingEvent,
} from "../../types.js";
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
  // Hand activation is card activation (rule 8-5-2) and completes regardless.
  // A Main resolved from trash that was never activated publishes nothing.
  const completes =
    !resolved.effectNotActivated ||
    notification.type !== "EVENT_MAIN_RESOLVED_FROM_TRASH";
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
    events: completes ? [...resolved.events, notification] : resolved.events,
    succeeded: true,
    result,
  };
}

/**
 * Rules 8-1-2, 8-3-1-3 and 8-3-1-4: a declined optional Main, or one whose
 * activation cost is abandoned or unpayable, was never activated. Callers pass
 * the state after popping the abandoned frame. When that frame was the [Main]
 * of an Event resolved from trash, its completion boundary stays on the stack
 * (it still returns control to the parent) but no longer publishes
 * EVENT_MAIN_RESOLVED_FROM_TRASH. Hand activation is card activation (8-5-2),
 * so its completion is kept.
 */
export function withdrawUnactivatedTrashMain(
  state: GameState,
  abandoned: EffectStackFrame
): GameState {
  const top = state.effectStack.at(-1);
  const trigger = abandoned.effectBlock.trigger;
  if (
    top?.eventActivationCompletion?.type !== "EVENT_MAIN_RESOLVED_FROM_TRASH" ||
    top.sourceCardInstanceId !== abandoned.sourceCardInstanceId ||
    !trigger ||
    !("keyword" in trigger) ||
    trigger.keyword !== "MAIN_EVENT"
  )
    return state;
  const boundary: EffectStackFrame = { ...top };
  delete boundary.eventActivationCompletion;
  return {
    ...state,
    effectStack: [...state.effectStack.slice(0, -1), boundary],
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

/** Carry the caller's queued siblings on its continuation, never on the Event's
 * prompt. Other prompt shapes retain the existing top-frame behavior. */
export function updateEffectContinuation(
  state: GameState,
  firstNewFrame: number,
  patch: (frame: EffectStackFrame) => Partial<EffectStackFrame>
): GameState {
  const candidate = state.effectStack[firstNewFrame];
  const isEventParent =
    candidate?.phase === "INTERRUPTED_BY_TRIGGERS" &&
    (candidate.pausedAction?.type === "ACTIVATE_EVENT_FROM_HAND" ||
      candidate.pausedAction?.type === "ACTIVATE_EVENT_FROM_TRASH") &&
    state.effectStack[firstNewFrame + 1]?.eventActivationCompletion !==
      undefined;
  const index = isEventParent ? firstNewFrame : state.effectStack.length - 1;
  const frame = state.effectStack[index];
  if (!frame) return state;
  return {
    ...state,
    effectStack: state.effectStack.map((current, i) =>
      i === index ? { ...current, ...patch(frame) } : current
    ),
  };
}
