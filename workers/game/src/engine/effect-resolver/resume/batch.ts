/**
 * OPT-172 batch-resume re-entry: after a mid-batch trigger drain (rule 6-2)
 * completes, re-invokes the original multi-target action handler with the
 * remaining-batch state carried on the frame's batchResumeMarker.
 */

import type {
  Action,
  EffectBlock,
  EffectResult,
} from "../../effect-types.js";
import type {
  BatchResumeMarker,
  CardData,
  GameState,
  PendingEvent,
  EffectStackFrame,
  QueuedTrigger,
} from "../../../types.js";
import { popFrame, peekFrame, pushFrame } from "../../effect-stack.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { executeActionChain } from "../resolver.js";
import { executePlayCard, executeSetRest } from "../actions/play.js";
import { executeKO } from "../actions/removal.js";
import { nanoid } from "../../../util/nanoid.js";
import type { EffectResolverResult, ActionResult } from "../types.js";
import { processRemainingTriggers } from "./triggers.js";

/**
 * Loop in case the re-entered handler completes cleanly (no prompt, no new
 * triggers, no further batch pause) while another AWAITING_BATCH_RESUME frame
 * sits underneath it on the stack.
 */
export function reenterBatchResume(
  state: GameState,
  cardDb: Map<string, CardData>,
  priorEvents: PendingEvent[] = [],
): EffectResolverResult {
  let nextState = state;
  const events = [...priorEvents];

  while (true) {
    const top = peekFrame(nextState) as EffectStackFrame | null;
    if (!top || top.phase !== "AWAITING_BATCH_RESUME" || !top.batchResumeMarker) {
      return { state: nextState, events, resolved: true };
    }
    // Triggers were drained by processRemainingTriggers (the only caller). The
    // frame's pendingTriggers snapshot is stale at this point; we pop and
    // re-invoke unconditionally.

    nextState = popFrame(nextState);
    const marker = top.batchResumeMarker;
    const resultRefs = new Map<string, EffectResult>(
      top.resultRefs.map(([k, v]) => [k, v as EffectResult]),
    );

    const actionResult = dispatchBatchResume(
      nextState,
      marker,
      top.sourceCardInstanceId,
      top.controller,
      cardDb,
      resultRefs,
    );
    nextState = actionResult.state;
    events.push(...actionResult.events);

    if (actionResult.pendingPrompt) {
      return { state: nextState, events, resolved: false, pendingPrompt: actionResult.pendingPrompt };
    }

    // Another mid-batch pause: re-entry produced events that queued more
    // triggers. Push a fresh AWAITING_BATCH_RESUME frame and drain via the
    // same machinery the original push site uses.
    if (actionResult.pendingBatchTriggers) {
      const { triggers, marker: nextMarker } = actionResult.pendingBatchTriggers;
      nextState = pushBatchResumeFrame(
        nextState,
        top.sourceCardInstanceId,
        top.controller,
        top.effectBlock as EffectBlock,
        nextMarker,
        triggers,
        top.remainingActions as Action[],
        resultRefs,
      );
      return processRemainingTriggers(nextState, triggers, cardDb, events);
    }

    // Scan events emitted by the re-entry. Any new triggers (e.g., the last
    // frame's ON_PLAY) drain via the normal path before we check for another
    // AWAITING_BATCH_RESUME frame underneath.
    if (actionResult.events.length > 0) {
      const scan = scanEventsForTriggers(nextState, actionResult.events, top.controller, cardDb);
      nextState = scan.state;
      if (scan.triggers.length > 0) {
        return processRemainingTriggers(nextState, scan.triggers, cardDb, events);
      }
    }

    // Continue any remainingActions queued behind this batch. Matches
    // chain-continuation in other resume branches.
    if (top.remainingActions.length > 0) {
      const chainResult = executeActionChain(
        nextState,
        top.remainingActions as Action[],
        top.sourceCardInstanceId,
        top.controller,
        cardDb,
        resultRefs,
      );
      nextState = chainResult.state;
      events.push(...chainResult.events);
      if (chainResult.pendingPrompt) {
        return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
      }
      if (chainResult.events.length > 0) {
        const chainScan = scanEventsForTriggers(nextState, chainResult.events, top.controller, cardDb);
        nextState = chainScan.state;
        if (chainScan.triggers.length > 0) {
          return processRemainingTriggers(nextState, chainScan.triggers, cardDb, events);
        }
      }
    }
    // Loop: check for another AWAITING_BATCH_RESUME frame underneath.
  }
}

function dispatchBatchResume(
  state: GameState,
  marker: BatchResumeMarker,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): ActionResult {
  switch (marker.kind) {
    case "PLAY_CARD":
      return executePlayCard(
        state,
        marker.pausedAction,
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs,
        undefined,
        marker.resumeFrame,
      );
    case "KO":
      return executeKO(
        state,
        marker.pausedAction,
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs,
        marker.remainingTargetIds,
      );
    case "SET_REST":
      return executeSetRest(
        state,
        marker.pausedAction,
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs,
        marker.remainingTargetIds,
      );
  }
}

/**
 * Push an AWAITING_BATCH_RESUME frame onto the effect stack. Shared by the
 * resolver push site (when a handler first returns pendingBatchTriggers) and
 * the re-entry path above (when a re-invoked handler pauses again).
 */
export function pushBatchResumeFrame(
  state: GameState,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  effectBlock: EffectBlock,
  marker: BatchResumeMarker,
  triggers: QueuedTrigger[],
  remainingActions: Action[],
  resultRefs: Map<string, EffectResult>,
): GameState {
  const frame: EffectStackFrame = {
    id: nanoid(),
    sourceCardInstanceId,
    controller,
    effectBlock,
    phase: "AWAITING_BATCH_RESUME",
    pausedAction: marker.pausedAction,
    remainingActions,
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: triggers,
    simultaneousTriggers: [],
    accumulatedEvents: [],
    batchResumeMarker: marker,
  };
  return pushFrame(state, frame);
}
