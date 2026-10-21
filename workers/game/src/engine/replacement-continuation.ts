/** Replacement batch completion reports events to the one pending-work drain. */
import type { CardData, GameState, PendingEvent } from "../types.js";
import type { EffectResult } from "./effect-types.js";
import type { EffectResolverServices } from "./effect-resolver/types.js";
import {
  batchContextOf,
  continueReplacementBatchAfterSubstitute,
} from "./replacements.js";
import { popFrame } from "./effect-stack.js";
import { updateFrameById } from "./damage-frames.js";
import { frameKindOf } from "./frame-kinds.js";
import { takeInterruptedEvents } from "./effect-resolver/resume/events.js";
function recordReplacementContinuationResult(
  state: GameState,
  frameId: string,
  succeeded: boolean,
  finalizedIds: string[]
): GameState {
  return updateFrameById(state, frameId, (frame) => {
    const resultRefs = [...frame.resultRefs];
    const resultRef = frame.pausedAction?.result_ref;
    if (resultRef) {
      const existing = resultRefs.findIndex(([key]) => key === resultRef);
      const previousResult =
        existing >= 0 ? resultRefs[existing][1] : undefined;
      const nextResult: [string, EffectResult] = [
        resultRef,
        {
          targetInstanceIds: [
            ...(previousResult?.targetInstanceIds ?? []),
            ...finalizedIds,
          ],
          count: (previousResult?.count ?? 0) + finalizedIds.length,
        },
      ];
      if (existing >= 0) resultRefs[existing] = nextResult;
      else resultRefs.push(nextResult);
    }
    return {
      ...frame,
      priorActionSucceeded: frame.priorActionSucceeded === true || succeeded,
      resultRefs,
    };
  });
}

export function advanceReplacementBatch(
  state: GameState,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
) {
  const context = batchContextOf(state.effectStack.at(-1)!);
  const batch = continueReplacementBatchAfterSubstitute(
    popFrame(state),
    context,
    cardDb,
    services
  );
  state = batch.state;
  const caller = state.effectStack.at(-1);
  if (caller && frameKindOf(caller) === "TRIGGER_DRAIN")
    state = recordReplacementContinuationResult(
      state,
      caller.id,
      batch.finalizedIds.length > 0,
      batch.finalizedIds
    );
  const prefix = takeInterruptedEvents(state);
  const events: PendingEvent[] = [...prefix.events, ...batch.events];
  return {
    state: prefix.state,
    events,
    ...(batch.pendingPrompt ? { pendingPrompt: batch.pendingPrompt } : {}),
  };
}
