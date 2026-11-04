import { isGameTerminated } from "../../terminal.js";
/**
 * Batch continuation: the shared executor re-invokes the original
 * multi-target action handler with the
 * remaining-batch state carried on the frame's batchResumeMarker.
 */

import { pendingPropagationEvents, retainEventsOnFrame } from "./events.js";
import type { Action, EffectBlock, EffectResult } from "../../effect-types.js";
import type {
  BatchResumeMarker,
  CardData,
  GameState,
  PendingEvent,
  EffectStackFrame,
  QueuedTrigger,
  PromptResumeContext,
  ResumeContext,
} from "../../../types.js";
import {
  CONTINUATION_EFFECT_BLOCK,
  popFrame,
  peekFrame,
  pushFrame,
} from "../../effect-stack.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { executePlayCard, executeSetRest } from "../actions/play.js";
import { executeKO } from "../actions/removal.js";
import { promptTypeToPhase } from "../cost-handler.js";
import type {
  HandlerResult,
  ActionResult,
  EffectResolverServices,
} from "../types.js";
import { replacePendingEventReferences } from "../../events.js";
import { generateFrameId } from "../../effect-stack.js";
import { insertFrameAt } from "../../damage-frames.js";

/**
 * Perform one batch continuation step. Return its progress to the shared
 * executor, which owns any further child or trigger advancement.
 */
export function reenterBatchResume(
  state: GameState,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices,
  priorEvents: PendingEvent[] = []
): HandlerResult {
  let nextState = state;
  const events = [...priorEvents];
  if (isGameTerminated(nextState))
    return { kind: "terminal", state: nextState, events, resolved: false };

  {
    const top = peekFrame(nextState);
    if (
      !top ||
      top.phase !== "AWAITING_BATCH_RESUME" ||
      !top.batchResumeMarker
    ) {
      return { kind: "completed", state: nextState, events, resolved: true };
    }
    // The shared executor owns queued triggers. The
    // frame's pendingTriggers snapshot is stale at this point; we pop and
    // re-invoke unconditionally.

    // The saved prefix precedes events from the trigger drain. Shared
    // references are one occurrence, while equal-payload events remain distinct.
    events.splice(
      0,
      events.length,
      ...new Set([...pendingPropagationEvents(top.accumulatedEvents), ...events]),
    );
    nextState = popFrame(nextState);
    const stackDepth = nextState.effectStack.length;
    const marker = top.batchResumeMarker;
    const resultRefs = new Map<string, EffectResult>(top.resultRefs);
    // The paused handler's `result_ref` must describe the whole batch on every
    // exit below (OPT-885): record the progress carried on the marker before
    // re-entry, then widen it with whatever the re-entered handler adds.
    recordBatchResult(resultRefs, marker);

    const actionResult = dispatchBatchResume(
      nextState,
      marker,
      top.sourceCardInstanceId,
      top.controller,
      cardDb,
      resultRefs,
      services.withCommittedEvents(events)
    );
    nextState = actionResult.state;
    events.push(...actionResult.events);
    if (isGameTerminated(nextState))
      return { kind: "terminal", state: nextState, events, resolved: false };
    recordBatchResult(resultRefs, marker, actionResult.result);

    if (actionResult.pendingPrompt) {
      const context = actionResult.pendingPrompt.resumeContext;
      if (!isResumeContext(context)) {
        const progressTargetIds = batchProgressTargetIds(marker);
        const generated = generateFrameId(nextState);
        const continuationFrame: EffectStackFrame = {
          id: generated.id,
          sourceCardInstanceId: top.sourceCardInstanceId,
          controller: top.controller,
          effectDescription: top.effectDescription,
          effectBlock: CONTINUATION_EFFECT_BLOCK,
          phase: "INTERRUPTED_BY_TRIGGERS",
          pausedAction: marker.pausedAction,
          remainingActions: top.remainingActions,
          resultRefs: [...resultRefs.entries()],
          validTargets: [],
          priorActionSucceeded: progressTargetIds.length > 0,
          costs: [],
          currentCostIndex: 0,
          costsPaid: true,
          oncePerTurnMarked: true,
          costResultRefs: [],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        // OPT-963: the re-entered handler owns its pause on a frame it pushed
        // (a replacement batch offer, an effect-damage window); this
        // continuation goes directly below it, at the depth the batch frame
        // occupied, so the handler's work finishes before the suffix resumes.
        nextState = insertFrameAt(generated.state, stackDepth, continuationFrame);
        return { kind: "waiting",
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: actionResult.pendingPrompt,
        };
      }
      const generated = generateFrameId(nextState);
      const promptFrame: EffectStackFrame = {
        id: generated.id,
        sourceCardInstanceId: context.effectSourceInstanceId,
        controller: context.controller,
        remainingActionsController: top.controller,
        effectDescription: top.effectDescription,
        effectBlock: CONTINUATION_EFFECT_BLOCK,
        phase: promptTypeToPhase(actionResult.pendingPrompt.options.promptType),
        pausedAction: context.pausedAction,
        remainingActions: top.remainingActions,
        resultRefs: context.resultRefs,
        validTargets: context.validTargets,
        returnToDeckArrangement: context.returnToDeckArrangement,
        fieldToLifeTargetIds: context.fieldToLifeTargetIds,
        giveDonIdentity: context.giveDonIdentity,
        costs: [],
        currentCostIndex: 0,
        costsPaid: true,
        oncePerTurnMarked: true,
        costResultRefs: [],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
        playOverflow: context.ruleTrashForPlay,
        stateDistributionForPlay: context.stateDistributionForPlay,
      };
      nextState = pushFrame(generated.state, promptFrame);
      return { kind: "waiting",
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: {
          ...actionResult.pendingPrompt,
          resumeContext: promptFrame.id,
        },
      };
    }

    // Another mid-batch pause: re-entry produced events that queued more
    // triggers. Push a fresh AWAITING_BATCH_RESUME frame and drain via the
    // same machinery the original push site uses.
    if (actionResult.pendingBatchTriggers) {
      const { triggers, marker: nextMarker } =
        actionResult.pendingBatchTriggers;
      nextState = pushBatchResumeFrame(
        nextState,
        top.sourceCardInstanceId,
        top.controller,
        top.effectBlock,
        nextMarker,
        triggers,
        top.remainingActions,
        resultRefs,
        top.effectDescription,
      );
      return services.reportTriggers(
        nextState,
        triggers,
        cardDb,
        events
      );
    }

    // Report events emitted by re-entry. Newly fulfilled ordinary triggers
    // remain queued while this batch's remaining actions finish.
    if (actionResult.events.length > 0) {
      const scan = scanEventsForTriggers(
        nextState,
        actionResult.events,
        top.controller,
        cardDb
      );
      nextState = scan.state;
      replacePendingEventReferences(events, actionResult.events, scan.events);
      if (scan.triggers.length > 0) {
        nextState = services.reportTriggers(
          nextState, scan.triggers, cardDb, events
        ).state;
      }
    }

    // Continue any remainingActions queued behind this batch. Matches
    // chain-continuation in other resume branches.
    if (top.remainingActions.length > 0) {
      const chainResult = services.withCommittedEvents(events).executeActionChain(
        nextState,
        top.remainingActions,
        top.sourceCardInstanceId,
        top.controller,
        cardDb,
        resultRefs,
        top.effectDescription,
      );
      nextState = chainResult.state;
      events.push(...chainResult.events);
      if (isGameTerminated(nextState))
        return { kind: "terminal", state: nextState, events, resolved: false };
      if (chainResult.pendingPrompt) {
        nextState = retainEventsOnFrame(nextState, stackDepth, events);
        return { kind: "waiting",
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: chainResult.pendingPrompt,
        };
      }
      if (chainResult.events.length > 0) {
        const chainScan = scanEventsForTriggers(
          nextState,
          chainResult.events,
          top.controller,
          cardDb
        );
        nextState = chainScan.state;
        replacePendingEventReferences(
          events,
          chainResult.events,
          chainScan.events
        );
        if (chainScan.triggers.length > 0) {
          nextState = services.reportTriggers(
            nextState, chainScan.triggers, cardDb, events
          ).state;
        }
      }
    }
    // One batch step only. The shared executor decides whether the next
    // state-owned continuation belongs to this effect or an older generation.
    return { kind: "continued", state: nextState, events, resolved: true };
  }
}

/**
 * Store the paused action's result under its `result_ref`: the targets the
 * batch already processed before the pause, plus any the re-entered handler
 * reports. A re-entry that processes nothing returns no result, so the
 * marker's progress is the only record of what the batch did.
 */
function recordBatchResult(
  resultRefs: Map<string, EffectResult>,
  marker: BatchResumeMarker,
  reentered?: EffectResult,
): void {
  const ref = marker.pausedAction.result_ref;
  if (!ref) return;
  const targetInstanceIds = [
    ...new Set([
      ...batchProgressTargetIds(marker),
      ...(reentered?.targetInstanceIds ?? []),
    ]),
  ];
  resultRefs.set(ref, {
    ...reentered,
    targetInstanceIds,
    count: targetInstanceIds.length,
  });
}

function batchProgressTargetIds(marker: BatchResumeMarker): string[] {
  switch (marker.kind) {
    case "KO":
      return marker.koedSoFar;
    case "PLAY_CARD":
      return marker.resumeFrame.playedSoFar;
    case "SET_REST":
      return marker.restedSoFar;
  }
}

function isResumeContext(
  context: PromptResumeContext
): context is ResumeContext {
  return (
    typeof context === "object" &&
    context !== null &&
    "effectSourceInstanceId" in context &&
    "controller" in context &&
    "remainingActions" in context &&
    "resultRefs" in context &&
    "validTargets" in context
  );
}

function dispatchBatchResume(
  state: GameState,
  marker: BatchResumeMarker,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  services: EffectResolverServices
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
        marker.resumeFrame
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
        services
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
        services
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
  _triggers: QueuedTrigger[],
  remainingActions: Action[],
  resultRefs: Map<string, EffectResult>,
  effectDescription?: string,
): GameState {
  const generated = generateFrameId(state);
  const frame: EffectStackFrame = {
    id: generated.id,
    sourceCardInstanceId,
    controller,
    effectDescription,
    effectBlock,
    phase: "AWAITING_BATCH_RESUME",
    pausedAction: marker.pausedAction,
    remainingActions,
    resultRefs: [...resultRefs.entries()],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    batchResumeMarker: marker,
  };
  return pushFrame(generated.state, frame);
}
