/**
 * Resume dispatchers — resumeEffectChain (action-type based) and
 * resumeFromStack (phase based). Branch bodies live in ./resume/*.ts:
 *
 *   deck.ts     — ARRANGE_TOP_CARDS branches (SEARCH_DECK, SEARCH_TRASH_THE_REST,
 *                 SEARCH_AND_PLAY, REORDER_ALL_LIFE) + shared arrange helpers
 *   target.ts   — REDISTRIBUTE_DON, SELECT_TARGET (including rule 3-7-6-1
 *                 overflow-trash-for-play)
 *   choice.ts   — PLAYER_CHOICE branches + AWAITING_OPTIONAL_RESPONSE +
 *                 AWAITING_TRIGGER_ORDER_SELECTION
 *   cost.ts     — AWAITING_COST_SELECTION
 *   batch.ts    — reenterBatchResume, dispatchBatchResume, pushBatchResumeFrame
 *   triggers.ts — processRemainingTriggers
 */

import type { Action, EffectResult } from "../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  ResumeContext,
  EffectStackFrame,
} from "../../types.js";
import { generateFrameId, popFrame, peekFrame, pushFrame, updateTopFrame } from "../effect-stack.js";
import { scanEventsForTriggers } from "../trigger-ordering.js";
import { executeActionChain } from "./resolver.js";
import type { EffectResolverResult } from "./types.js";

import {
  handleArrangeSearchDeck,
  handleArrangeSearchTrashTheRest,
  handleArrangeSearchAndPlay,
  handleArrangeReorderLife,
} from "./resume/deck.js";
import {
  handleRedistributeDon,
  handleSelectTargetRuleTrashForPlay,
  handleSelectTarget,
} from "./resume/target.js";
import {
  handlePlayerChoiceStateDistribution,
  handlePlayerChoiceDonReturn,
  handlePlayerChoiceBranch,
  handleAwaitingOptionalResponse,
  handleAwaitingTriggerOrderSelection,
} from "./resume/choice.js";
import { handleAwaitingCostSelection } from "./resume/cost.js";
import { processRemainingTriggers } from "./resume/triggers.js";
import { promptTypeToPhase } from "./cost-handler.js";
import { isEngineTerminated } from "../engine-limits.js";
import { replacePendingEventReferences } from "../events.js";

// Re-export the stable public API so existing imports keep working.
export { processRemainingTriggers } from "./resume/triggers.js";
export { reenterBatchResume, pushBatchResumeFrame } from "./resume/batch.js";

// ─── resumeEffectChain ───────────────────────────────────────────────────────

export function resumeEffectChain(
  state: GameState,
  resumeCtx: ResumeContext,
  action: GameAction,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const {
    effectSourceInstanceId,
    controller,
    pausedAction,
    remainingActions,
    resultRefs: resultRefsEntries,
    validTargets,
  } = resumeCtx;
  const remainingActionsController = resumeCtx.remainingActionsController ?? controller;

  const resultRefs = new Map<string, EffectResult>(
    resultRefsEntries.map(([k, v]) => [k, v as EffectResult]),
  );
  const events: PendingEvent[] = [];
  let nextState = state;

  // Player skipped the optional effect
  if (action.type === "PASS") {
    return { state, events, resolved: false };
  }
  if (action.type === "PLAYER_CHOICE" && action.choiceId === "skip") {
    return { state, events, resolved: false };
  }

  // ── ARRANGE_TOP_CARDS branches ────────────────────────────────────────────
  const deckSearch = handleArrangeSearchDeck(nextState, action, pausedAction, controller, validTargets, events);
  if (deckSearch) nextState = deckSearch;

  const deckTrashRest = handleArrangeSearchTrashTheRest(
    nextState,
    action,
    pausedAction,
    controller,
    validTargets,
    events,
  );
  if (deckTrashRest) nextState = deckTrashRest;

  const deckAndPlay = handleArrangeSearchAndPlay(nextState, action, pausedAction, controller, cardDb, events, validTargets);
  if (deckAndPlay) nextState = deckAndPlay;

  const lifeReorder = handleArrangeReorderLife(nextState, action, pausedAction, controller, events);
  if (lifeReorder) nextState = lifeReorder;

  // ── PLAYER_CHOICE branches ────────────────────────────────────────────────
  // Note: these are mutually exclusive in the original if/else-if chain.
  const stateDist = handlePlayerChoiceStateDistribution(nextState, action, resumeCtx, resultRefs, cardDb, events);
  if (stateDist?.kind === "terminal") return stateDist.result;
  if (stateDist?.kind === "fallthrough") {
    nextState = stateDist.state;
  } else {
    const donReturn = handlePlayerChoiceDonReturn(nextState, action, resumeCtx, events);
    if (donReturn?.kind === "terminal") return donReturn.result;
    if (donReturn?.kind === "fallthrough") {
      nextState = donReturn.state;
    } else {
      const playerChoice = handlePlayerChoiceBranch(nextState, action, resumeCtx, resultRefs, cardDb, events);
      if (playerChoice?.kind === "terminal") return playerChoice.result;
      if (playerChoice?.kind === "fallthrough") nextState = playerChoice.state;
    }
  }

  // ── REDISTRIBUTE_DON branch ───────────────────────────────────────────────
  const redistribute = handleRedistributeDon(nextState, action, resumeCtx, resultRefs, events);
  if (redistribute?.kind === "terminal") return redistribute.result;
  if (redistribute?.kind === "fallthrough") nextState = redistribute.state;

  // ── SELECT_TARGET branches (rule-trash-for-play first, then generic) ──────
  const ruleTrash = handleSelectTargetRuleTrashForPlay(nextState, action, resumeCtx, resultRefs, cardDb, events);
  if (ruleTrash?.kind === "terminal") return ruleTrash.result;
  // ruleTrash always returns terminal or null — no fallthrough case

  const selectTarget = handleSelectTarget(nextState, action, resumeCtx, resultRefs, cardDb, events);
  if (selectTarget?.kind === "terminal") return selectTarget.result;
  if (selectTarget?.kind === "fallthrough") nextState = selectTarget.state;

  // ── Tail: execute remainingActions (also handles OPTIONAL_EFFECT resume
  //         where pausedAction is null) ────────────────────────────────────
  if (remainingActions.length > 0) {
    const chainResult = executeActionChain(
      nextState,
      remainingActions,
      effectSourceInstanceId,
      remainingActionsController,
      cardDb,
      resultRefs,
    );
    nextState = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
    }
  }

  return { state: nextState, events, resolved: true };
}

// ─── resumeFromStack ─────────────────────────────────────────────────────────

export function resumeFromStack(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const topFrame = peekFrame(state) as EffectStackFrame | null;
  if (!topFrame) {
    return { state, events: [], resolved: true };
  }

  const { sourceCardInstanceId, controller, phase } = topFrame;

  switch (phase) {
    case "AWAITING_OPTIONAL_RESPONSE":
      return handleAwaitingOptionalResponse(state, action, topFrame, cardDb);

    case "AWAITING_COST_SELECTION":
      return handleAwaitingCostSelection(state, action, topFrame, cardDb);

    // ── Target selection / arrange cards / player choice (mid-action) ────
    case "AWAITING_TARGET_SELECTION":
    case "AWAITING_ARRANGE_CARDS":
    case "AWAITING_PLAYER_CHOICE": {
      const events: PendingEvent[] = [];
      let nextState = popFrame(state);
      const stackDepthAfterPop = nextState.effectStack.length;

      const legacyCtx: ResumeContext = {
        effectSourceInstanceId: sourceCardInstanceId,
        controller,
        remainingActionsController: topFrame.remainingActionsController,
        pausedAction: topFrame.pausedAction as Action | null,
        remainingActions: topFrame.remainingActions as Action[],
        resultRefs: topFrame.resultRefs,
        validTargets: topFrame.validTargets,
        ruleTrashForPlay: topFrame.ruleTrashForPlay,
        stateDistributionForPlay: topFrame.stateDistributionForPlay,
      };

      const result = resumeEffectChain(nextState, legacyCtx, action, cardDb);
      nextState = result.state;
      events.push(...result.events);
      if (isEngineTerminated(nextState)) {
        return { state: nextState, events, resolved: false };
      }

      const replacementFrameWasPushed = nextState.effectStack.length > stackDepthAfterPop;
      if (result.rejected) {
        nextState = pushFrame(nextState, topFrame);
        if (isEngineTerminated(nextState)) {
          return { state: nextState, events, resolved: false };
        }
        if (!result.pendingPrompt) {
          return { ...result, state: nextState };
        }
      }

      if (result.pendingPrompt) {
        let pendingPrompt = result.pendingPrompt;
        const pendingResumeContext = pendingPrompt.resumeContext as { type?: unknown } | null;
        const isReplacementPrompt = pendingResumeContext?.type === "REPLACEMENT" ||
          pendingResumeContext?.type === "REPLACEMENT_BATCH";
        if (result.rejected) {
          pendingPrompt = { ...pendingPrompt, resumeContext: topFrame.id };
        } else if (!replacementFrameWasPushed && isReplacementPrompt) {
          const continuationFrame: EffectStackFrame = {
            ...topFrame,
            id: generateFrameId(),
            phase: "INTERRUPTED_BY_TRIGGERS",
            validTargets: [],
            priorActionSucceeded: false,
            accumulatedEvents: [...topFrame.accumulatedEvents, ...result.events],
          };
          nextState = pushFrame(nextState, continuationFrame);
          if (isEngineTerminated(nextState)) {
            return { state: nextState, events, resolved: false };
          }
        } else if (!replacementFrameWasPushed) {
          const promptCtx = pendingPrompt.resumeContext as ResumeContext;
          const replacementFrame: EffectStackFrame = {
            ...topFrame,
            id: generateFrameId(),
            sourceCardInstanceId: promptCtx.effectSourceInstanceId,
            controller: promptCtx.controller,
            phase: promptTypeToPhase(pendingPrompt.options.promptType),
            pausedAction: promptCtx.pausedAction,
            remainingActions: topFrame.remainingActions,
            resultRefs: promptCtx.resultRefs,
            validTargets: promptCtx.validTargets,
            accumulatedEvents: [...topFrame.accumulatedEvents, ...result.events],
            ruleTrashForPlay: promptCtx.ruleTrashForPlay,
            stateDistributionForPlay: promptCtx.stateDistributionForPlay,
          };
          nextState = pushFrame(nextState, replacementFrame);
          if (isEngineTerminated(nextState)) {
            return { state: nextState, events, resolved: false };
          }
          pendingPrompt = { ...pendingPrompt, resumeContext: replacementFrame.id };
        } else {
          const replacementFrame = peekFrame(nextState) as EffectStackFrame | null;
          if (replacementFrame) {
            nextState = updateTopFrame(nextState, {
              pendingTriggers: [
                ...replacementFrame.pendingTriggers,
                ...topFrame.pendingTriggers,
              ],
              replacementBatchContinuation: topFrame.replacementBatchContinuation,
            });
          }
        }
        return { state: nextState, events, resolved: false, pendingPrompt, rejected: result.rejected };
      }

      // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
      if (result.events.length > 0) {
        const chainScan = scanEventsForTriggers(nextState, result.events, controller, cardDb);
        nextState = chainScan.state;
        replacePendingEventReferences(events, result.events, chainScan.events);
        if (chainScan.triggers.length > 0) {
          const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers];
          return processRemainingTriggers(nextState, allTriggers, cardDb, events);
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    // ── Interrupted by nested triggers (triggers have completed, resume) ─
    case "INTERRUPTED_BY_TRIGGERS": {
      const events: PendingEvent[] = [];
      let nextState = popFrame(state);

      if (topFrame.remainingActions.length > 0) {
        const resultRefs = new Map<string, EffectResult>(
          topFrame.resultRefs.map(([k, v]) => [k, v as EffectResult]),
        );
        const chainResult = executeActionChain(
          nextState,
          topFrame.remainingActions as Action[],
          sourceCardInstanceId,
          controller,
          cardDb,
          resultRefs,
          undefined,
          topFrame.priorActionSucceeded ?? true,
        );
        nextState = chainResult.state;
        events.push(...chainResult.events);

        if (chainResult.pendingPrompt) {
          const nestedFrame = peekFrame(nextState) as EffectStackFrame | null;
          if (nestedFrame && topFrame.replacementBatchContinuation) {
            nextState = updateTopFrame(nextState, {
              replacementBatchContinuation: topFrame.replacementBatchContinuation,
            });
          }
          return { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
        }

        // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
        if (chainResult.events.length > 0) {
          const chainScan = scanEventsForTriggers(nextState, chainResult.events, controller, cardDb);
          nextState = chainScan.state;
          replacePendingEventReferences(events, chainResult.events, chainScan.events);
          if (chainScan.triggers.length > 0) {
            const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers];
            return processRemainingTriggers(nextState, allTriggers, cardDb, events);
          }
        }
      }

      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb, events);
    }

    case "AWAITING_TRIGGER_ORDER_SELECTION":
      return handleAwaitingTriggerOrderSelection(state, action, topFrame, cardDb);

    default:
      return { state, events: [], resolved: false };
  }
}
