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

import type { Action, Cost, EffectBlock, EffectResult } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  EffectStackFrame,
  QueuedTrigger,
  ResumeContext,
} from "../../../types.js";
import { popFrame, peekFrame, updateTopFrame } from "../../effect-stack.js";
import { emitEvent } from "../../events.js";
import { scanEventsForTriggers, buildTriggerSelectionPrompt } from "../../trigger-ordering.js";
import { markOncePerTurnUsed } from "../action-utils.js";
import { payCostsWithSelection } from "../cost-handler.js";
import { costResultToEntries, costResultRefsFromEntries } from "../types.js";
import { resolveEffect, executeActionChain } from "../resolver.js";
import { executePlayCard } from "../actions/play.js";
import type { EffectResolverResult } from "../types.js";
import { processRemainingTriggers } from "./triggers.js";

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
): ChoiceBranchResult {
  const { pausedAction, controller, effectSourceInstanceId, stateDistributionForPlay } = resumeCtx;
  if (action.type !== "PLAYER_CHOICE" || !pausedAction || pausedAction.type !== "PLAY_CARD" || !stateDistributionForPlay) {
    return null;
  }

  const sd = stateDistributionForPlay;
  const parts = action.choiceId.split(":");
  if (parts.length !== 3 || parts[0] !== "play-state") {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
  }
  const [, echoedId, chosenState] = parts;
  if (echoedId !== sd.pendingTargetId) {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
  }
  if (chosenState !== "ACTIVE" && chosenState !== "RESTED") {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
  }
  if (sd.remaining[chosenState] <= 0) {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
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
    },
  );
  let nextState = actionResult.state;
  events.push(...actionResult.events);

  if (actionResult.pendingPrompt) {
    return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: actionResult.pendingPrompt } };
  }
  if (actionResult.result && (pausedAction as any).result_ref) {
    resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
  }

  // Fall through to remainingActions processing below.
  return { kind: "fallthrough", state: nextState };
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
): ChoiceBranchResult {
  const { pausedAction, controller, effectSourceInstanceId } = resumeCtx;
  if (action.type !== "PLAYER_CHOICE" || !pausedAction) {
    return null;
  }
  if (pausedAction.type !== "PLAYER_CHOICE" && pausedAction.type !== "OPPONENT_CHOICE") {
    return null;
  }

  let nextState = state;
  const options = (pausedAction.params?.options as Action[][]) ?? [];
  const chosenIndex = parseInt(action.choiceId, 10);
  const chosenBranch = options[chosenIndex];
  if (chosenBranch) {
    const branchResult = executeActionChain(
      nextState,
      chosenBranch,
      effectSourceInstanceId,
      controller,
      cardDb,
      resultRefs,
    );
    nextState = branchResult.state;
    events.push(...branchResult.events);

    if (branchResult.pendingPrompt) {
      return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: branchResult.pendingPrompt } };
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
    effectStack: state.effectStack.filter(
      (f) => (f as unknown as EffectStackFrame).id !== frameId,
    ) as GameState["effectStack"],
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
): EffectResolverResult {
  const { sourceCardInstanceId, controller } = topFrame;
  const events: PendingEvent[] = [];
  let nextState = state;

  if (action.type === "PASS" || (action.type === "PLAYER_CHOICE" && action.choiceId === "skip")) {
    const declinedBlock = topFrame.effectBlock as EffectBlock;
    nextState = popFrame(nextState);
    if (declinedBlock.flags?.lock_on_decline) {
      nextState = markOncePerTurnUsed(nextState, declinedBlock.id, sourceCardInstanceId);
    }
    return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
  }

  const block = topFrame.effectBlock as EffectBlock;
  let costRefs: Map<string, EffectResult> | undefined;
  if (topFrame.costs.length > 0) {
    const costResult = payCostsWithSelection(
      nextState, topFrame.costs as Cost[], 0, controller, cardDb,
      sourceCardInstanceId, block,
    );

    if (costResult.cannotPay) {
      nextState = popFrame(costResult.state);
      if (block.flags?.once_per_turn) {
        nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
      }
      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
    }

    nextState = costResult.state;
    events.push(...costResult.events);

    if (costResult.costResult) {
      costRefs = costResultRefsFromEntries(costResultToEntries(costResult.costResult));
    }

    if (costResult.pendingPrompt) {
      const newTop = peekFrame(nextState) as EffectStackFrame;
      if (newTop && newTop.id !== topFrame.id) {
        nextState = popFrameById(nextState, topFrame.id);
        nextState = updateTopFrame(nextState, { pendingTriggers: topFrame.pendingTriggers });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: costResult.pendingPrompt };
    }
  }

  nextState = popFrame(nextState);
  if (block.flags?.once_per_turn) {
    nextState = markOncePerTurnUsed(nextState, block.id, sourceCardInstanceId);
  }

  if (topFrame.remainingActions.length > 0) {
    const chainResult = executeActionChain(
      nextState,
      topFrame.remainingActions as Action[],
      sourceCardInstanceId,
      controller,
      cardDb,
      costRefs,
    );
    nextState = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      const newTop = peekFrame(nextState) as EffectStackFrame;
      if (newTop) {
        nextState = updateTopFrame(nextState, { pendingTriggers: topFrame.pendingTriggers });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
    }

    // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
    if (chainResult.events.length > 0) {
      const chainScan = scanEventsForTriggers(nextState, chainResult.events, controller, cardDb);
      nextState = chainScan.state;
      if (chainScan.triggers.length > 0) {
        const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers as QueuedTrigger[]];
        return processRemainingTriggers(nextState, allTriggers, cardDb, events);
      }
    }
  }

  return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
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
): EffectResolverResult {
  const events: PendingEvent[] = [];
  let nextState = state;

  const simultaneous = (topFrame.simultaneousTriggers ?? []) as QueuedTrigger[];
  const savedPendingTriggers = topFrame.pendingTriggers as QueuedTrigger[];

  // "Done" — player opted to skip remaining optional triggers
  if (action.type === "PLAYER_CHOICE" && action.choiceId === "done") {
    nextState = popFrame(nextState);
    return processRemainingTriggers(nextState, savedPendingTriggers, cardDb, events);
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
  const result = resolveEffect(
    nextState,
    chosenTrigger.effectBlock as EffectBlock,
    chosenTrigger.sourceCardInstanceId,
    chosenTrigger.controller,
    cardDb,
  );
  nextState = result.state;
  events.push(...result.events);

  // If chosen trigger needs player input, carry forward remaining triggers.
  // Merge simultaneousTriggers into pendingTriggers so processRemainingTriggers
  // will re-detect the 2+ same-player group and re-prompt for ordering.
  if (result.pendingPrompt) {
    const newTop = peekFrame(nextState) as EffectStackFrame | null;
    if (newTop) {
      nextState = updateTopFrame(nextState, {
        pendingTriggers: [...remaining, ...savedPendingTriggers],
      });
    }
    return { state: nextState, events, resolved: false, pendingPrompt: result.pendingPrompt };
  }

  // Emit events from the resolved trigger
  for (const event of result.events) {
    nextState = emitEvent(
      nextState,
      event.type,
      event.playerIndex ?? chosenTrigger.controller,
      event.payload ?? {},
    );
  }

  // Scan for nested triggers (LIFO — resolve before returning to simultaneous set)
  if (result.events.length > 0) {
    const scanResult = scanEventsForTriggers(
      nextState, result.events, chosenTrigger.controller, cardDb,
    );
    nextState = scanResult.state;
    if (scanResult.triggers.length > 0) {
      // Process nested triggers first, then come back to remaining simultaneous
      const nestedResult = processRemainingTriggers(nextState, scanResult.triggers, cardDb, events);
      nextState = nestedResult.state;
      // nestedResult.events already includes our prior events (passed as priorEvents)
      if (nestedResult.pendingPrompt) {
        const newTop = peekFrame(nextState) as EffectStackFrame | null;
        if (newTop) {
          nextState = updateTopFrame(nextState, {
            pendingTriggers: [...remaining, ...savedPendingTriggers],
          });
        }
        return { state: nextState, events: nestedResult.events, resolved: false, pendingPrompt: nestedResult.pendingPrompt };
      }
      // Push any new events from nested resolution
      events.length = 0;
      events.push(...nestedResult.events);
    }
  }

  // Re-prompt for remaining simultaneous triggers
  if (remaining.length > 1) {
    const promptResult = buildTriggerSelectionPrompt(
      nextState, remaining, savedPendingTriggers, cardDb,
    );
    return { state: promptResult.state, events, resolved: false, pendingPrompt: promptResult.pendingPrompt };
  }

  if (remaining.length === 1) {
    // Auto-resolve the last one
    const lastResult = resolveEffect(
      nextState,
      remaining[0].effectBlock as EffectBlock,
      remaining[0].sourceCardInstanceId,
      remaining[0].controller,
      cardDb,
    );
    nextState = lastResult.state;
    events.push(...lastResult.events);

    if (lastResult.pendingPrompt) {
      const newTop = peekFrame(nextState) as EffectStackFrame | null;
      if (newTop) {
        nextState = updateTopFrame(nextState, {
          pendingTriggers: savedPendingTriggers,
        });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: lastResult.pendingPrompt };
    }

    // Emit events from the last trigger
    for (const event of lastResult.events) {
      nextState = emitEvent(
        nextState,
        event.type,
        event.playerIndex ?? remaining[0].controller,
        event.payload ?? {},
      );
    }

    // Scan for nested triggers from last resolved trigger
    if (lastResult.events.length > 0) {
      const scanResult2 = scanEventsForTriggers(
        nextState, lastResult.events, remaining[0].controller, cardDb,
      );
      nextState = scanResult2.state;
      if (scanResult2.triggers.length > 0) {
        const nestedResult = processRemainingTriggers(nextState, scanResult2.triggers, cardDb, events);
        nextState = nestedResult.state;
        if (nestedResult.pendingPrompt) {
          const newTop = peekFrame(nextState) as EffectStackFrame | null;
          if (newTop) {
            nextState = updateTopFrame(nextState, { pendingTriggers: savedPendingTriggers });
          }
          return { state: nextState, events: nestedResult.events, resolved: false, pendingPrompt: nestedResult.pendingPrompt };
        }
        events.length = 0;
        events.push(...nestedResult.events);
      }
    }
  }

  // All simultaneous triggers done — process remaining pending triggers
  return processRemainingTriggers(nextState, savedPendingTriggers, cardDb, events);
}
