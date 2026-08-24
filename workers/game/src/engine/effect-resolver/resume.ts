import type {
  CardData,
  GameAction,
  GameState,
  PendingEvent,
  QueuedTrigger,
  ResumeContext,
} from "../../types.js";
import { resolverExecutionServices } from "./resolver.js";
import {
  resumeEffectChain as resumeEffectChainCore,
  resumeFromStack as resumeFromStackCore,
} from "./resume-core.js";
import { processRemainingTriggers as processRemainingTriggersCore } from "./resume/triggers.js";

export function resumeEffectChain(
  state: GameState,
  resumeCtx: ResumeContext,
  action: GameAction,
  cardDb: Map<string, CardData>
) {
  return resumeEffectChainCore(
    state,
    resumeCtx,
    action,
    cardDb,
    resolverExecutionServices
  );
}

export function resumeFromStack(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>
) {
  return resumeFromStackCore(state, action, cardDb, resolverExecutionServices);
}

export function processRemainingTriggers(
  state: GameState,
  pendingTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  priorEvents: PendingEvent[] = [],
  triggerOrderingGroup?: import("../../types.js").EffectStackFrame["triggerOrderingGroup"]
) {
  return processRemainingTriggersCore(
    state,
    pendingTriggers,
    cardDb,
    resolverExecutionServices,
    priorEvents,
    triggerOrderingGroup
  );
}

export { reenterBatchResume, pushBatchResumeFrame } from "./resume/batch.js";
