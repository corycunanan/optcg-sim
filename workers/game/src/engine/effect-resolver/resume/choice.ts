/**
 * PLAYER_CHOICE resume handlers.
 *
 * resumeEffectChain-level branches:
 *   - handlePlayerChoiceStateDistribution — OPT-114 per-frame PLAY_CARD
 *     ACTIVE/RESTED prompts during multi-target state_distribution plays
 *   - handlePlayerChoiceBranch — generic PLAYER_CHOICE / OPPONENT_CHOICE
 *     branch-picker
 *
 * resumeFromStack-level cases:
 *   - handleAwaitingOptionalResponse — accept/decline an optional effect
 *   - handleAwaitingTriggerOrderSelection — player picks next trigger in a
 *     simultaneous same-player group (§8-6)
 */

import type { EffectResult } from "../../effect-types.js";
import { getActionParams, isOncePerTurnBlock } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  EffectStackFrame,
  ResumeContext,
} from "../../../types.js";
import { CONTINUATION_EFFECT_BLOCK, popFrame, peekFrame, updateTopFrame } from "../../effect-stack.js";
import { emitEvent, getEventCardInstanceId, replacePendingEventReferences } from "../../events.js";
import {
  scanEventsForTriggers,
  buildTriggerSelectionPrompt,
} from "../../trigger-ordering.js";
import { markOncePerTurnUsed } from "../action-utils.js";
import { payCostsWithSelection } from "../cost-handler.js";
import { costResultToEntries, costResultRefsFromEntries } from "../types.js";
import { postCostConditionsMet } from "../post-cost.js";
import { executePlayCard } from "../actions/play.js";
import {
  applyFieldDonReturn,
  decodeFieldDonReturnChoice,
} from "../actions/don.js";
import type { EffectResolverResult, EffectResolverServices } from "../types.js";
import { pushBatchResumeFrame } from "./batch.js";

export interface ChoiceFallthrough {
  kind: "fallthrough";
  state: GameState;
}

export interface ChoiceTerminal {
  kind: "terminal";
  result: EffectResolverResult;
}

export type ChoiceBranchResult = ChoiceFallthrough | ChoiceTerminal | null;

// ─── resumeEffectChain branches ─────────────────────────────────────────────

/**
 * OPT-114: Resume from per-frame PLAYER_CHOICE (ACTIVE/RESTED) during a
 * multi-target PLAY_CARD with state_distribution. choiceId shape:
 * "play-state:<instanceId>:<ACTIVE|RESTED>". Rejects stale responses where
 * the echoed instanceId does not match the pending target this prompt was
 * bound to (defensive per stale-modal feedback).
 *
 * Marker: this branch is mutually exclusive with handlePlayerChoiceBranch in
 * the original `if/else if` chain. If this one matches, the caller should
 * skip the generic branch-picker.
 */
export function handlePlayerChoiceStateDistribution(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  resultRefs: Map<string, EffectResult>,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
  services: EffectResolverServices,
): ChoiceBranchResult {
  const {
    pausedAction,
    controller,
    effectSourceInstanceId,
    stateDistributionForPlay,
  } = resumeCtx;
  if (
    action.type !== "PLAYER_CHOICE" ||
    !pausedAction ||
    pausedAction.type !== "PLAY_CARD" ||
    !stateDistributionForPlay
  ) {
    return null;
  }

  const sd = stateDistributionForPlay;
  const parts = action.choiceId.split(":");
  if (parts.length !== 3 || parts[0] !== "play-state") {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }
  const [, echoedId, chosenState] = parts;
  if (echoedId !== sd.pendingTargetId) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }
  if (chosenState !== "ACTIVE" && chosenState !== "RESTED") {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }
  if (sd.remaining[chosenState] <= 0) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }

  const actionResult = executePlayCard(
    state,
    pausedAction,
    effectSourceInstanceId,
    controller,
    cardDb,
    resultRefs,
    undefined,
    {
      remainingTargetIds: sd.remainingTargetIds,
      remaining: sd.remaining,
      playedSoFar: sd.playedSoFar,
      forcedFirstState: chosenState,
      queuedTriggers: sd.queuedTriggers,
    }
  );
  const nextState = actionResult.state;
  events.push(...actionResult.events);

  if (actionResult.pendingPrompt) {
    return {
      kind: "terminal",
      result: {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: actionResult.pendingPrompt,
      },
    };
  }
  if (actionResult.pendingBatchTriggers) {
    const { triggers, marker } = actionResult.pendingBatchTriggers;
    const nextWithFrame = pushBatchResumeFrame(
      nextState,
      effectSourceInstanceId,
      controller,
      CONTINUATION_EFFECT_BLOCK,
      marker,
      triggers,
      resumeCtx.remainingActions,
      resultRefs,
    );
    return {
      kind: "terminal",
      result: services.processRemainingTriggers(nextWithFrame, triggers, cardDb, events),
    };
  }
  if (actionResult.result && pausedAction.result_ref) {
    resultRefs.set(pausedAction.result_ref, actionResult.result);
  }

  // Fall through to remainingActions processing below.
  return { kind: "fallthrough", state: nextState };
}

/**
 * OPT-413 / OPT-426: FORCE_OPPONENT_DON_RETURN choice — the DON!! owner picked
 * which field DON!! return (OP16-074 Magellan FAQ). The plan covers cost-area
 * active/rested DON!! plus DON!! detached from named Leader/Characters; see
 * `decodeFieldDonReturnChoice` for the id grammar. Rejects choices the prompt
 * did not offer (stale-modal defense).
 *
 * Mutually exclusive with handlePlayerChoiceBranch (different pausedAction
 * type); the caller should skip the generic branch-picker when this matches.
 */
export function handlePlayerChoiceDonReturn(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  events: PendingEvent[]
): ChoiceBranchResult {
  const { pausedAction, controller } = resumeCtx;
  if (
    action.type !== "PLAYER_CHOICE" ||
    !pausedAction ||
    pausedAction.type !== "FORCE_OPPONENT_DON_RETURN"
  ) {
    return null;
  }
  if (
    resumeCtx.validTargets &&
    !resumeCtx.validTargets.includes(action.choiceId)
  ) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }
  const decoded = decodeFieldDonReturnChoice(action.choiceId);
  if (!decoded) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }

  const opp: 0 | 1 = controller === 0 ? 1 : 0;
  const applied = applyFieldDonReturn(state, opp, decoded.plan);
  events.push(...applied.events);
  return { kind: "fallthrough", state: applied.state };
}

export function handleChooseValue(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  resultRefs: Map<string, EffectResult>
): ChoiceBranchResult {
  const { pausedAction, validTargets } = resumeCtx;
  if (
    action.type !== "PLAYER_CHOICE" ||
    !pausedAction ||
    pausedAction.type !== "CHOOSE_VALUE"
  ) {
    return null;
  }
  if (!validTargets?.includes(action.choiceId)) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }
  const match = /^choose-value:(-?\d+)$/.exec(action.choiceId);
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(value) || !pausedAction.result_ref) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }
  resultRefs.set(pausedAction.result_ref, {
    targetInstanceIds: [],
    count: 1,
    value,
  });
  return { kind: "fallthrough", state };
}

/**
 * Generic PLAYER_CHOICE / OPPONENT_CHOICE branch-picker resume.
 * In the original `if/else if`, this is the `else` side of the
 * state-distribution branch.
 */
export function handlePlayerChoiceBranch(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  resultRefs: Map<string, EffectResult>,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
  services: EffectResolverServices
): ChoiceBranchResult {
  const { pausedAction, controller, effectSourceInstanceId, remainingActions } =
    resumeCtx;
  if (action.type !== "PLAYER_CHOICE" || !pausedAction) {
    return null;
  }
  if (
    pausedAction.type !== "PLAYER_CHOICE" &&
    pausedAction.type !== "OPPONENT_CHOICE"
  ) {
    return null;
  }
  if (
    resumeCtx.validTargets &&
    resumeCtx.validTargets.length > 0 &&
    !resumeCtx.validTargets.includes(action.choiceId)
  ) {
    return {
      kind: "terminal",
      result: { state, events: [], resolved: false, rejected: true },
    };
  }

  let nextState = state;
  const options = getActionParams(pausedAction, pausedAction.type).options;
  const chosenIndex = parseInt(action.choiceId, 10);
  const chosenBranch = options[chosenIndex];
  if (chosenBranch) {
    const branchResult = services.executeActionChain(
      nextState,
      chosenBranch,
      effectSourceInstanceId,
      controller,
      cardDb,
      resultRefs
    );
    nextState = branchResult.state;
    events.push(...branchResult.events);

    if (branchResult.pendingPrompt) {
      const replacementFrame = peekFrame(nextState);
      if (replacementFrame && remainingActions.length > 0) {
        nextState = updateTopFrame(nextState, {
          remainingActions: [
            ...replacementFrame.remainingActions,
            ...remainingActions,
          ],
        });
      }
      return {
        kind: "terminal",
        result: {
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: branchResult.pendingPrompt,
        },
      };
    }
  }

  return { kind: "fallthrough", state: nextState };
}

// ─── resumeFromStack cases ──────────────────────────────────────────────────

/**
 * Stack helper — pop a specific frame by id (used when costResult replaces
 * the current frame with a new waiting frame on top).
 */
function popFrameById(state: GameState, frameId: string): GameState {
  return {
    ...state,
    effectStack: state.effectStack.filter((frame) => frame.id !== frameId),
  };
}

/**
 * AWAITING_OPTIONAL_RESPONSE — player accepts or declines an optional effect.
 * On decline, we mark once-per-turn if `lock_on_decline`. On accept, we pay
 * costs (which may themselves pause), then execute the action chain.
 */
export function handleAwaitingOptionalResponse(
  state: GameState,
  action: GameAction,
  topFrame: EffectStackFrame,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  const { sourceCardInstanceId, controller } = topFrame;
  const events: PendingEvent[] = [];
  let nextState = state;

  if (
    action.type === "PASS" ||
    (action.type === "PLAYER_CHOICE" && action.choiceId === "skip")
  ) {
    const declinedBlock = topFrame.effectBlock;
    nextState = popFrame(nextState);
    if (declinedBlock.flags?.lock_on_decline) {
      nextState = markOncePerTurnUsed(
        nextState,
        declinedBlock.id,
        sourceCardInstanceId
      );
    }
    return services.processRemainingTriggers(
      nextState,
      topFrame.pendingTriggers,
      cardDb
    );
  }

  const block = topFrame.effectBlock;
  let costRefs: Map<string, EffectResult> | undefined;
  if (topFrame.costs.length > 0) {
    const costResult = payCostsWithSelection(
      nextState,
      topFrame.costs,
      0,
      controller,
      cardDb,
      sourceCardInstanceId,
      block,
      services
    );

    if (costResult.cannotPay) {
      nextState = popFrame(costResult.state);
      return services.processRemainingTriggers(
        nextState,
        topFrame.pendingTriggers,
        cardDb
      );
    }

    nextState = costResult.state;
    events.push(...costResult.events);

    if (costResult.costResult) {
      costRefs = costResultRefsFromEntries(
        costResultToEntries(costResult.costResult)
      );
    }

    if (costResult.pendingPrompt) {
      const newTop = peekFrame(nextState);
      if (newTop && newTop.id !== topFrame.id) {
        nextState = popFrameById(nextState, topFrame.id);
        nextState = updateTopFrame(nextState, {
          pendingTriggers: topFrame.pendingTriggers,
          resultRefs: topFrame.resultRefs,
        });
      }
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: costResult.pendingPrompt,
      };
    }
  }

  nextState = popFrame(nextState);
  if (isOncePerTurnBlock(block)) {
    nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
  }

  // OPT-453: cost payments on the prompt-resume path never flow back through
  // the pipeline's event scan — scan them here so event-watching auto effects
  // (e.g. CARD_REMOVED_FROM_LIFE watchers on auto-paid life-trash costs)
  // queue exactly as they do when the same cost pays inside a pipeline run.
  // Same filter as resume/cost.ts: the count-only CARD_TRASHED bookkeeping
  // event carries no instance id and must not reach trigger matching.
  let pendingTriggers = topFrame.pendingTriggers;
  if (events.length > 0) {
    const scannable = events.filter(
      (e) =>
      e.type !== "CARD_TRASHED" ||
        Boolean(getEventCardInstanceId(e))
    );
    if (scannable.length > 0) {
      const costScan = scanEventsForTriggers(
        nextState,
        scannable,
        controller,
        cardDb
      );
      nextState = costScan.state;
      replacePendingEventReferences(events, scannable, costScan.events);
      if (costScan.triggers.length > 0) {
        pendingTriggers = [...pendingTriggers, ...costScan.triggers];
      }
    }
  }

  // OPT-437: the post-colon "If" gate — costs were paid inline above and the
  // chain is about to start; when false, skip every action (the paid cost
  // stands) but still drain queued triggers.
  if (
    !postCostConditionsMet(
      nextState,
      block,
      sourceCardInstanceId,
      controller,
      cardDb
    )
  ) {
    return services.processRemainingTriggers(
      nextState,
      pendingTriggers,
      cardDb,
      events
    );
  }

  if (topFrame.remainingActions.length > 0) {
    const actionRefs = new Map<string, EffectResult>(topFrame.resultRefs);
    for (const [key, value] of costRefs ?? []) actionRefs.set(key, value);
    const chainResult = services.executeActionChain(
      nextState,
      topFrame.remainingActions,
      sourceCardInstanceId,
      controller,
      cardDb,
      actionRefs.size > 0 ? actionRefs : undefined
    );
    nextState = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      const newTop = peekFrame(nextState);
      if (newTop) {
        nextState = updateTopFrame(nextState, { pendingTriggers });
      }
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: chainResult.pendingPrompt,
      };
    }

    // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
    if (chainResult.events.length > 0) {
      const chainScan = scanEventsForTriggers(
        nextState,
        chainResult.events,
        controller,
        cardDb
      );
      nextState = chainScan.state;
      replacePendingEventReferences(
        events,
        chainResult.events,
        chainScan.events
      );
      if (chainScan.triggers.length > 0) {
        const allTriggers = [...chainScan.triggers, ...pendingTriggers];
        return services.processRemainingTriggers(
          nextState,
          allTriggers,
          cardDb,
          events
        );
      }
    }
  }

  return services.processRemainingTriggers(
    nextState,
    pendingTriggers,
    cardDb,
    events
  );
}

/**
 * AWAITING_TRIGGER_ORDER_SELECTION — player picks which of 2+ simultaneous
 * same-player triggers resolves next. Remaining triggers stay in simultaneous
 * set; nested triggers fire LIFO before we return to the simultaneous group.
 */
export function handleAwaitingTriggerOrderSelection(
  state: GameState,
  action: GameAction,
  topFrame: EffectStackFrame,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  const events: PendingEvent[] = [];
  let nextState = state;

  const simultaneous = topFrame.simultaneousTriggers;
  const savedPendingTriggers = topFrame.pendingTriggers;

  // "Done" — player opted to skip remaining optional triggers
  if (action.type === "PLAYER_CHOICE" && action.choiceId === "done") {
    nextState = popFrame(nextState);
    return services.processRemainingTriggers(
      nextState,
      savedPendingTriggers,
      cardDb,
      events
    );
  }

  if (action.type !== "PLAYER_CHOICE" || action.choiceId == null) {
    return { state, events, resolved: false };
  }

  const chosenIndex = parseInt(action.choiceId, 10);
  const chosenTrigger = simultaneous[chosenIndex];
  if (!chosenTrigger) {
    return { state, events, resolved: false };
  }

  // Remove chosen trigger from the remaining simultaneous set
  const remaining = simultaneous.filter((_, i) => i !== chosenIndex);

  // Pop the selection frame
  nextState = popFrame(nextState);

  // Resolve the chosen trigger
  const result = services.resolveEffect(
    nextState,
    chosenTrigger.effectBlock,
    chosenTrigger.sourceCardInstanceId,
    chosenTrigger.controller,
    cardDb,
    (
      chosenTrigger.triggeringEvent?.payload as
        | { cardInstanceId?: string }
        | undefined
    )?.cardInstanceId ?? null
  );
  nextState = result.state;
  events.push(...result.events);

  // If chosen trigger needs player input, carry forward remaining triggers.
  // Merge simultaneousTriggers into pendingTriggers so processRemainingTriggers
  // will re-detect the 2+ same-player group and re-prompt for ordering.
  if (result.pendingPrompt) {
    const newTop = peekFrame(nextState);
    if (newTop) {
      nextState = updateTopFrame(nextState, {
        pendingTriggers: [...remaining, ...savedPendingTriggers],
      });
    }
    return {
      state: nextState,
      events,
      resolved: false,
      pendingPrompt: result.pendingPrompt,
    };
  }

  // Emit events from the resolved trigger
  for (const event of result.events) {
    nextState = emitEvent(
      nextState,
      event.type,
      event.playerIndex ?? chosenTrigger.controller,
      event.payload ?? {}
    );
  }

  // Scan for nested triggers (LIFO — resolve before returning to simultaneous set)
  if (result.events.length > 0) {
    const scanResult = scanEventsForTriggers(
      nextState,
      result.events,
      chosenTrigger.controller,
      cardDb
    );
    nextState = scanResult.state;
    replacePendingEventReferences(events, result.events, scanResult.events);
    if (scanResult.triggers.length > 0) {
      // Process nested triggers first, then come back to remaining simultaneous
      const nestedResult = services.processRemainingTriggers(
        nextState,
        scanResult.triggers,
        cardDb,
        events
      );
      nextState = nestedResult.state;
      // nestedResult.events already includes our prior events (passed as priorEvents)
      if (nestedResult.pendingPrompt) {
        const newTop = peekFrame(nextState);
        if (newTop) {
          nextState = updateTopFrame(nextState, {
            pendingTriggers: [...remaining, ...savedPendingTriggers],
          });
        }
        return {
          state: nextState,
          events: nestedResult.events,
          resolved: false,
          pendingPrompt: nestedResult.pendingPrompt,
        };
      }
      // Push any new events from nested resolution
      events.length = 0;
      events.push(...nestedResult.events);
    }
  }

  // Re-prompt for remaining simultaneous triggers
  if (remaining.length > 1) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState,
      remaining,
      savedPendingTriggers,
      cardDb
    );
    return {
      state: promptResult.state,
      events,
      resolved: false,
      pendingPrompt: promptResult.pendingPrompt,
    };
  }

  if (remaining.length === 1) {
    // Auto-resolve the last one
    const lastResult = services.resolveEffect(
      nextState,
      remaining[0].effectBlock,
      remaining[0].sourceCardInstanceId,
      remaining[0].controller,
      cardDb
    );
    nextState = lastResult.state;
    events.push(...lastResult.events);

    if (lastResult.pendingPrompt) {
      const newTop = peekFrame(nextState);
      if (newTop) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: savedPendingTriggers,
        });
      }
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: lastResult.pendingPrompt,
      };
    }

    // Emit events from the last trigger
    for (const event of lastResult.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? remaining[0].controller,
        event.payload ?? {}
      );
    }

    // Scan for nested triggers from last resolved trigger
    if (lastResult.events.length > 0) {
      const scanResult2 = scanEventsForTriggers(
        nextState,
        lastResult.events,
        remaining[0].controller,
        cardDb
      );
      nextState = scanResult2.state;
      replacePendingEventReferences(
        events,
        lastResult.events,
        scanResult2.events
      );
      if (scanResult2.triggers.length > 0) {
        const nestedResult = services.processRemainingTriggers(
          nextState,
          scanResult2.triggers,
          cardDb,
          events
        );
        nextState = nestedResult.state;
        if (nestedResult.pendingPrompt) {
          const newTop = peekFrame(nextState);
          if (newTop) {
            nextState = updateTopFrame(nextState, {
              pendingTriggers: savedPendingTriggers,
            });
          }
          return {
            state: nextState,
            events: nestedResult.events,
            resolved: false,
            pendingPrompt: nestedResult.pendingPrompt,
          };
        }
        events.length = 0;
        events.push(...nestedResult.events);
      }
    }
  }

  // All simultaneous triggers done — process remaining pending triggers
  return services.processRemainingTriggers(
    nextState,
    savedPendingTriggers,
    cardDb,
    events
  );
}
