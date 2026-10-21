import { advanceTriggerExecution, createEffectExecutionScope, createTriggerExecution, reportTriggerWork, selectTriggerForExecution, triggerExecutionOwner } from "../trigger-executor.js";
import type {
  CardData,
  GameAction,
  GameState,
  PendingEvent,
  QueuedTrigger,
  ResumeContext,
} from "../../types.js";
import { withStableOrderingIds } from "../trigger-ordering.js";
import type { HandlerResult } from "./types.js";
import { resolverExecutionServices } from "./resolver.js";
import {
  resumeEffectChain as resumeEffectChainCore,
  resumeFromStack as resumeFromStackCore,
} from "./resume-core.js";

/** Lift legacy frame-owned waiting work before any resumed action can report
 * fresh triggers. The waiting cohort remains older than all new reports. */
function ownLegacyResume(state: GameState): GameState {
  const top = state.effectStack.at(-1);
  if (!top) return state;
  // A completion-only Event boundary has no effect body to suspend. Its
  // notification scan reports any matches through the shared queue service.
  if (top.eventActivation && state.effectStack.length === 1) return state;
  if (!triggerExecutionOwner(state)) {
    // Preserve an already offered legacy ordering decision as its active
    // cohort. Otherwise own the deepest waiting cohort before any child runs.
    const waiting = state.effectStack.findIndex((frame) =>
      frame.phase !== "AWAITING_BATCH_RESUME" && frame.pendingTriggers.length > 0
    );
    const damageIndex = state.effectStack.findIndex(frame =>
      frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
      frame.battleDamage.battleId === state.turn.battle?.battleId
    );
    const index = damageIndex >= 0 ? damageIndex
      : top.phase === "AWAITING_TRIGGER_ORDER_SELECTION" || waiting < 0
        ? state.effectStack.length - 1 : waiting;
    const frame = state.effectStack[index];
    const scoped = createEffectExecutionScope(state, frame.sourceCardInstanceId, frame.controller);
    let owner = triggerExecutionOwner(scoped)!;
    let child = frame;
    if (top.phase === "AWAITING_TRIGGER_ORDER_SELECTION") {
      const choices = withStableOrderingIds(top.simultaneousTriggers);
      const group = top.triggerOrderingGroup ?? { triggers: choices, resolvedTriggerIds: [] };
      owner = { ...owner, triggerExecution: { generations: [
        { triggers: choices, orderingGroup: group },
        ...(top.pendingTriggers.length ? [{ triggers: withStableOrderingIds(top.pendingTriggers) }] : []),
      ] } };
      child = { ...top, simultaneousTriggers: choices, triggerOrderingGroup: group, pendingTriggers: [] };
    }
    state = { ...scoped, effectStack: [
      ...state.effectStack.slice(0, index), owner, child, ...state.effectStack.slice(index + 1),
    ] };
  }
  const frames = [...state.effectStack];
  let ownerIndex = -1;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (frame.triggerExecution) { ownerIndex = index; continue; }
    if (frame.phase === "AWAITING_BATCH_RESUME") {
      // Historical batch snapshots copied an already-reported queue; this
      // field is not another cohort and has never owned its execution.
      if (frame.pendingTriggers.length) frames[index] = { ...frame, pendingTriggers: [] };
      continue;
    }
    // Damage and phase boundaries retain their own release window. A legacy
    // ordinary continuation below an existing child scope instead contributes
    // closed older work ahead of that scope's newly fulfilled collector.
    if (frame.battleDamage || frame.effectDamage || frame.phaseBoundaryContinuation)
      continue;
    const targetOwnerIndex = ownerIndex >= 0 ? ownerIndex
      : frames.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.triggerExecution);
    if (targetOwnerIndex < 0) continue;
    const ordering = frame.phase === "AWAITING_TRIGGER_ORDER_SELECTION";
    if (ordering && frames[targetOwnerIndex].triggerExecution!.generations[0]?.triggers.length)
      continue;
    const triggers = withStableOrderingIds([
      ...(ordering ? frame.simultaneousTriggers : []), ...frame.pendingTriggers,
    ]);
    if (!triggers.length) continue;
    const owner = frames[targetOwnerIndex];
    const work = owner.triggerExecution!;
    const choiceTriggers = ordering ? triggers.slice(0, frame.simultaneousTriggers.length) : [];
    const group = frame.triggerOrderingGroup ?? (ordering
      ? { triggers: choiceTriggers, resolvedTriggerIds: [] } : undefined);
    const generation = { triggers, ...(group ? { orderingGroup: group } : {}) };
    const generations = [...work.generations];
    let collector = work.collectingGenerationIndex;
    if (generations.length === 1 && !generations[0].triggers.length && !work.selectedTrigger) {
      generations[0] = generation;
    } else {
      const insertion = collector ?? generations.length;
      generations.splice(insertion, 0, generation);
      if (collector !== undefined) collector++;
    }
    frames[targetOwnerIndex] = { ...owner, triggerExecution: {
      ...work, generations,
      ...(collector !== undefined ? { collectingGenerationIndex: collector } : {}),
    } };
    frames[index] = { ...frame, pendingTriggers: [],
      ...(ordering ? { simultaneousTriggers: choiceTriggers, triggerOrderingGroup: group }
        : { triggerOrderingGroup: undefined }),
    };
  }
  return { ...state, effectStack: frames };
}

/** Tags control advancement. A waiting/rejected handler cannot accidentally
 * drain its parent; a completed handler without an owner has nothing to drain. */
function advanceHandler(result: HandlerResult, cardDb: Map<string, CardData>): HandlerResult {
  switch (result.kind) {
    case "waiting":
      return result;
    case "terminal":
      return advanceTriggerExecution(result, cardDb, resolverExecutionServices);
    case "completed":
      if (!triggerExecutionOwner(result.state)) return result;
      return advanceTriggerExecution(result, cardDb, resolverExecutionServices);
    case "queued":
    case "continued":
      return advanceTriggerExecution(result, cardDb, resolverExecutionServices);
  }
}

export function resumeEffectChain(
  state: GameState,
  resumeCtx: ResumeContext,
  action: GameAction,
  cardDb: Map<string, CardData>
): HandlerResult {
  const original = state;
  state = createEffectExecutionScope(state, resumeCtx.effectSourceInstanceId, resumeCtx.controller);
  const result = resumeEffectChainCore(state, resumeCtx, action, cardDb, resolverExecutionServices);
  if (result.rejected && !result.reprompted)
    return { ...result, state: original };
  return advanceHandler(result, cardDb);
}

export function resumeFromStack(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>
): HandlerResult {
  const original = state;
  state = ownLegacyResume(state);
  const owner = triggerExecutionOwner(state);
  const selected = selectTriggerForExecution(state, action, cardDb);
  const result: HandlerResult = selected ?? (owner && state.effectStack.at(-1)?.id === owner.id
    ? { kind: "continued", state, events: [], resolved: true }
    : resumeFromStackCore(state, action, cardDb, resolverExecutionServices));
  const oldChoice = original.effectStack.at(-1);
  const normalizedLegacyChoice = oldChoice?.phase === "AWAITING_TRIGGER_ORDER_SELECTION" &&
    (!oldChoice.triggerOrderingGroup || oldChoice.simultaneousTriggers.some((trigger) => !trigger.orderingId));
  if (result.rejected && !result.reprompted)
    return { ...result, state: normalizedLegacyChoice ? result.state : original };
  return advanceHandler(result, cardDb);
}

export function processRemainingTriggers(
  state: GameState,
  pendingTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  priorEvents: PendingEvent[] = [],
  triggerOrderingGroup?: import("../../types.js").EffectStackFrame["triggerOrderingGroup"]
) {
  const result = triggerExecutionOwner(state)
    ? reportTriggerWork(state, pendingTriggers, priorEvents, triggerOrderingGroup)
    : { ...createTriggerExecution(state, pendingTriggers, triggerOrderingGroup), events: priorEvents };
  return advanceHandler(result, cardDb);
}

export { reenterBatchResume, pushBatchResumeFrame } from "./resume/batch.js";
