import { updateEffectContinuation } from "./event-activation.js";
/**
 * Dependency-injected resume dispatchers — resumeEffectChain (action-type based) and
 * resumeFromStack (phase based). Branch bodies live in ./resume/*.ts:
 *
 *   deck.ts     — ARRANGE_TOP_CARDS branches (SEARCH_DECK, SEARCH_TRASH_THE_REST,
 *                 SEARCH_AND_PLAY, DECK_SCRY, REORDER_ALL_LIFE) + shared arrange
 *                 helpers
 *   target.ts   — REDISTRIBUTE_DON, SELECT_TARGET (including rule 3-7-6-1
 *                 overflow-trash-for-play)
 *   choice.ts   — PLAYER_CHOICE branches + AWAITING_OPTIONAL_RESPONSE +
 *                 AWAITING_TRIGGER_ORDER_SELECTION
 *   cost.ts     — AWAITING_COST_SELECTION
 *   batch.ts    — reenterBatchResume, dispatchBatchResume, pushBatchResumeFrame
 *   Cross-effect results are consumed by resume.ts and the shared trigger executor.
 */

import type { EffectResult } from "../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  ResumeContext,
  EffectStackFrame,
} from "../../types.js";
import {
  generateFrameId,
  popFrame,
  peekFrame,
  pushFrame,
} from "../effect-stack.js";
import { insertFrameAt } from "../damage-frames.js";
import { frameKindOf } from "../frame-kinds.js";
import { scanEventsForTriggers } from "../trigger-ordering.js";
import type { HandlerResult, EffectResolverServices } from "./types.js";
import {
  buildSelectTargetPrompt,
  validateTargetConstraints,
} from "./target-resolver.js";

import {
  handleArrangeSearchDeck,
  handleArrangeSearchTrashTheRest,
  handleArrangeSearchAndPlay,
  handleArrangeLifeScry,
  handleArrangeReorderLife,
  handleArrangeReturnToDeck,
  handleArrangeDeckScry,
} from "./resume/deck.js";
import {
  handleRedistributeDon,
  handleSelectTargetRuleTrashForPlay,
  handleSelectTarget,
  handleGiveDonIdentity,
} from "./resume/target.js";
import {
  handlePlayerChoiceStateDistribution,
  handlePlayerChoiceDonReturn,
  handleChooseValue,
  handleFieldToLifePosition,
  handlePlayerChoiceBranch,
  handleAwaitingOptionalResponse,
  handleAwaitingOptionalActionResponse,
  handleAwaitingTriggerOrderSelection,
} from "./resume/choice.js";
import { handleAwaitingCostSelection } from "./resume/cost.js";
import { promptTypeToPhase } from "./cost-handler.js";
import { isGameTerminated } from "../terminal.js";
import { runRuleProcessingAfterMove } from "../defeat.js";
import { replacePendingEventReferences } from "../events.js";
import {
  pendingPropagationEvents,
  retainEventsOnFrame,
  takeInterruptedEvents,
} from "./resume/events.js";
import { withChainDescription } from "./resolver.js";

/** A frame a handler pushed to own its own pause (OPT-963 kinds). */
function isHandlerOwnedFrame(frame: EffectStackFrame | undefined): boolean {
  if (!frame) return false;
  const kind = frameKindOf(frame);
  return kind === "REPLACEMENT" || kind === "REPLACEMENT_BATCH" || kind === "EFFECT_DAMAGE";
}

// Re-export the stable public API so existing imports keep working.
export { reenterBatchResume, pushBatchResumeFrame } from "./resume/batch.js";

// ─── resumeEffectChain ───────────────────────────────────────────────────────

export function resumeEffectChain(
  state: GameState,
  resumeCtx: ResumeContext,
  action: GameAction,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): HandlerResult {
  const {
    effectSourceInstanceId,
    controller,
    effectDescription,
    pausedAction,
    remainingActions,
    resultRefs: resultRefsEntries,
    validTargets,
  } = resumeCtx;
  const remainingActionsController =
    resumeCtx.remainingActionsController ?? controller;

  const resultRefs = new Map<string, EffectResult>(resultRefsEntries);
  const events: PendingEvent[] = [];
  services = services.withCommittedEvents(events);
  let nextState = state;
  let pausedActionSucceeded: boolean | undefined;

  // Player skipped the optional effect
  if (action.type === "PASS") {
    return { kind: isGameTerminated(state) ? "terminal" : "completed", state, events, resolved: false };
  }
  if (action.type === "PLAYER_CHOICE" && action.choiceId === "skip") {
    return { kind: isGameTerminated(state) ? "terminal" : "completed", state, events, resolved: false };
  }

  // ── ARRANGE_TOP_CARDS branches ────────────────────────────────────────────
  const deckSearch = handleArrangeSearchDeck(
    nextState,
    action,
    pausedAction,
    controller,
    validTargets,
    events
  );
  if (deckSearch) nextState = deckSearch;

  const deckTrashRest = handleArrangeSearchTrashTheRest(
    nextState,
    action,
    pausedAction,
    controller,
    validTargets,
    events
  );
  if (deckTrashRest) nextState = deckTrashRest;

  const deckAndPlay = handleArrangeSearchAndPlay(
    nextState,
    action,
    pausedAction,
    controller,
    cardDb,
    events,
    validTargets
  );
  if (deckAndPlay) nextState = deckAndPlay;

  const lifeReorder = handleArrangeReorderLife(
    nextState,
    action,
    pausedAction,
    controller,
    events
  );
  if (lifeReorder) nextState = lifeReorder;

  const lifeScry = handleArrangeLifeScry(
    nextState,
    action,
    pausedAction,
    controller,
    validTargets,
    events
  );
  if (lifeScry) nextState = lifeScry;

  // DECK_SCRY validates the whole group before placing it; an invalid
  // response is rejected with no state change and the prompt stays pending.
  const deckScry = handleArrangeDeckScry(
    nextState,
    action,
    pausedAction,
    controller,
    validTargets
  );
  if (deckScry?.rejected) {
    return { kind: "waiting", state, events: [], resolved: false, rejected: true };
  }
  if (deckScry) {
    nextState = deckScry.state;
    pausedActionSucceeded = true;
  }

  const returnToDeck = handleArrangeReturnToDeck(
    nextState,
    action,
    pausedAction,
    effectSourceInstanceId,
    controller,
    cardDb,
    resultRefs,
    validTargets,
    resumeCtx.returnToDeckArrangement,
    services
  );
  if (returnToDeck) {
    nextState = returnToDeck.state;
    events.push(...returnToDeck.events);
    pausedActionSucceeded = returnToDeck.succeeded;
    if (pausedAction?.result_ref && returnToDeck.result) {
      resultRefs.set(pausedAction.result_ref, returnToDeck.result);
    }
    if (returnToDeck.pendingPrompt) {
      return { kind: "waiting",
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: returnToDeck.pendingPrompt,
      };
    }
  }

  const fieldToLife = handleFieldToLifePosition(nextState, action, resumeCtx, resultRefs, cardDb);
  if (fieldToLife) {
    if (fieldToLife.rejected) return fieldToLife;
    nextState = fieldToLife.state;
    events.push(...fieldToLife.events);
    pausedActionSucceeded = fieldToLife.succeeded;
    // OPT-797: a position choice or one owner's Life order can open the next
    // owner's Rule 3-1-7 ordering prompt.
    if (fieldToLife.pendingPrompt) {
      return { kind: "waiting",
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: fieldToLife.pendingPrompt,
      };
    }
  }

  // ── PLAYER_CHOICE branches ────────────────────────────────────────────────
  // Note: these are mutually exclusive in the original if/else-if chain.
  const stateDist = handlePlayerChoiceStateDistribution(
    nextState,
    action,
    resumeCtx,
    resultRefs,
    cardDb,
    events,
    services
  );
  if (stateDist?.kind === "handled") return stateDist.result;
  if (stateDist?.kind === "continued") {
    nextState = stateDist.state;
  } else {
    const donReturn = handlePlayerChoiceDonReturn(
      nextState,
      action,
      resumeCtx,
      events
    );
    if (donReturn?.kind === "handled") return donReturn.result;
    if (donReturn?.kind === "continued") {
      nextState = donReturn.state;
    } else {
      const chooseValue = handleChooseValue(
        nextState,
        action,
        resumeCtx,
        resultRefs
      );
      if (chooseValue?.kind === "handled") return chooseValue.result;
      if (chooseValue?.kind === "continued") {
        nextState = chooseValue.state;
      } else {
        const playerChoice = handlePlayerChoiceBranch(
          nextState,
          action,
          resumeCtx,
          resultRefs,
          cardDb,
          events,
          services
        );
        if (playerChoice?.kind === "handled") return playerChoice.result;
        if (playerChoice?.kind === "continued")
          nextState = playerChoice.state;
      }
    }
  }

  // ── REDISTRIBUTE_DON branch ───────────────────────────────────────────────
  const redistribute = handleRedistributeDon(
    nextState,
    action,
    resumeCtx,
    resultRefs,
    events
  );
  if (redistribute?.kind === "handled") return redistribute.result;
  if (redistribute?.kind === "continued") nextState = redistribute.state;

  // ── SELECT_TARGET branches (GIVE_DON identity, rule-trash-for-play, then
  //    generic) ──────────────────────────────────────────────────────────────
  const giveDonIdentity = handleGiveDonIdentity(
    nextState,
    action,
    resumeCtx,
    events
  );
  if (giveDonIdentity?.kind === "handled") return giveDonIdentity.result;
  if (giveDonIdentity?.kind === "continued") {
    // The identity choice completed the paused GIVE_DON; the generic
    // SELECT_TARGET branch must not re-run it with the DON!! id as a target.
    nextState = giveDonIdentity.state;
    pausedActionSucceeded = giveDonIdentity.succeeded;
  } else {
    const ruleTrash = handleSelectTargetRuleTrashForPlay(
      nextState,
      action,
      resumeCtx,
      resultRefs,
      cardDb,
      events,
      services
    );
    if (ruleTrash?.kind === "handled") return ruleTrash.result;
    // ruleTrash always returns terminal or null — no fallthrough case

    const selectTarget = handleSelectTarget(
      nextState,
      action,
      resumeCtx,
      resultRefs,
      cardDb,
      events,
      services
    );
    if (selectTarget?.kind === "handled") return selectTarget.result;
    if (selectTarget?.kind === "continued") {
      nextState = selectTarget.state;
      pausedActionSucceeded = selectTarget.succeeded;
    }
  }

  // OPT-960: the resume handlers above move cards directly (search, scry,
  // Life reorder, field-to-Life), outside executeEffectAction's checkpoint.
  // Run rule processing on that move before the remaining chain (9-1-2).
  nextState = runRuleProcessingAfterMove(state, nextState, {}, cardDb);
  if (isGameTerminated(nextState)) return { kind: "terminal", state: nextState, events, resolved: true };

  // ── Tail: execute remainingActions (also handles OPTIONAL_EFFECT resume
  //         where pausedAction is null) ────────────────────────────────────
  if (remainingActions.length > 0) {
    const chainResult = services.withCommittedEvents(events).executeActionChain(
      nextState,
      remainingActions,
      effectSourceInstanceId,
      remainingActionsController,
      cardDb,
      resultRefs,
      effectDescription,
      pausedActionSucceeded
    );
    nextState = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      return { kind: "waiting",
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: chainResult.pendingPrompt,
      };
    }
  }

  return { kind: isGameTerminated(nextState) ? "terminal" : "completed", state: nextState, events, resolved: true };
}

// ─── resumeFromStack ─────────────────────────────────────────────────────────

export function resumeFromStack(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): HandlerResult {
  const topFrame = peekFrame(state);
  if (!topFrame) {
    return { kind: isGameTerminated(state) ? "terminal" : "completed", state, events: [], resolved: true };
  }

  const { sourceCardInstanceId, controller, phase } = topFrame;

  if (phase === "AWAITING_TARGET_SELECTION" && topFrame.simultaneousGroup) {
    const plan = topFrame.simultaneousGroup;
    const actionIndex = plan.nextActionIndex;
    const pausedAction = plan.actions[actionIndex];
    const resultRefs = new Map<string, EffectResult>(plan.resultRefs);
    const selected =
      action.type === "SELECT_TARGET"
        ? (action.selectedInstanceIds ?? [])
        : null;
    const invalid =
      selected === null ||
      selected.some((id) => !topFrame.validTargets.includes(id)) ||
      (pausedAction.target &&
        !validateTargetConstraints(
        selected,
        pausedAction.target,
        state,
        cardDb,
          resultRefs
      ));

    if (invalid) {
      const reprompt = buildSelectTargetPrompt(
        state,
        pausedAction,
        topFrame.validTargets,
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs
      );
      return { kind: "waiting",
        state,
        events: [],
        resolved: false,
        rejected: true,
        ...(reprompt.pendingPrompt
          ? {
              pendingPrompt: {
                ...withChainDescription(
                  reprompt.pendingPrompt,
                  topFrame.effectDescription,
                ),
                resumeContext: topFrame.id,
              },
            }
          : {}),
      };
    }

    const locks = [...plan.locks];
    locks[actionIndex] = { execute: true, targetInstanceIds: selected };
    const events = pendingPropagationEvents(topFrame.accumulatedEvents);
    const result = services.withCommittedEvents(events).continueSimultaneousGroup(
      popFrame(state),
      { ...plan, locks, nextActionIndex: actionIndex + 1 },
      sourceCardInstanceId,
      controller,
      cardDb
    );
    events.push(...result.events);
    let nextState = result.pendingPrompt
      ? retainEventsOnFrame(result.state, state.effectStack.length - 1, events)
      : result.state;
    if (!result.pendingPrompt) {
      const prefix = takeInterruptedEvents(nextState);
      nextState = prefix.state;
      events.unshift(...prefix.events);
    }
    return { kind: isGameTerminated(nextState) ? "terminal" : result.pendingPrompt ? "waiting" : "completed",
      state: nextState,
      events,
      resolved: !result.pendingPrompt && !isGameTerminated(nextState),
      ...(result.pendingPrompt ? { pendingPrompt: result.pendingPrompt } : {}),
    };
  }

  switch (phase) {
    case "AWAITING_OPTIONAL_RESPONSE":
      // OPT-799: an action-level "you may" parks its undecided action;
      // block-level optional frames have no paused action.
      if (topFrame.pausedAction?.optional === true) {
        return handleAwaitingOptionalActionResponse(
          state,
          action,
          topFrame,
          cardDb,
          services
        );
      }
      return handleAwaitingOptionalResponse(
        state,
        action,
        topFrame,
        cardDb,
        services
      );

    case "AWAITING_COST_SELECTION":
      return handleAwaitingCostSelection(
        state,
        action,
        topFrame,
        cardDb,
        services
      );

    // ── Target selection / arrange cards / player choice (mid-action) ────
    case "AWAITING_TARGET_SELECTION":
    case "AWAITING_ARRANGE_CARDS":
    case "AWAITING_PLAYER_CHOICE": {
      const events = pendingPropagationEvents(topFrame.accumulatedEvents);
      let nextState = popFrame(state);
      const stackDepthAfterPop = nextState.effectStack.length;

      const legacyCtx: ResumeContext = {
        effectSourceInstanceId: sourceCardInstanceId,
        controller,
        effectDescription: topFrame.effectDescription,
        remainingActionsController: topFrame.remainingActionsController,
        pausedAction: topFrame.pausedAction,
        remainingActions: topFrame.remainingActions,
        resultRefs: topFrame.resultRefs,
        validTargets: topFrame.validTargets,
        returnToDeckArrangement: topFrame.returnToDeckArrangement,
        fieldToLifeTargetIds: topFrame.fieldToLifeTargetIds,
        giveDonIdentity: topFrame.giveDonIdentity,
        ruleTrashForPlay: topFrame.playOverflow,
        stateDistributionForPlay: topFrame.stateDistributionForPlay,
      };

      const result = resumeEffectChain(
        nextState,
        legacyCtx,
        action,
        cardDb,
        services.withCommittedEvents(events)
      );
      nextState = result.state;
      events.push(...result.events);
      if (isGameTerminated(nextState)) {
        return { kind: "terminal", state: nextState, events, resolved: false };
      }

      const replacementFrameWasPushed =
        nextState.effectStack.length > stackDepthAfterPop;
      if (result.rejected) {
        nextState = pushFrame(nextState, topFrame);
        if (isGameTerminated(nextState)) {
          return { kind: "terminal", state: nextState, events, resolved: false };
        }
        if (!result.pendingPrompt) {
          return { ...result, state: nextState };
        }
      }

      if (result.pendingPrompt) {
        let pendingPrompt = result.pendingPrompt;
        if (result.rejected) {
          pendingPrompt = { ...pendingPrompt, resumeContext: topFrame.id };
        } else if (replacementFrameWasPushed && isHandlerOwnedFrame(nextState.effectStack[stackDepthAfterPop])) {
          // OPT-963: the resumed action's handler owns its pause on a frame
          // it pushed (a replacement batch, an effect-damage window). This
          // chain's continuation goes directly below it, at the depth the
          // resumed frame occupied, so the handler's work finishes first.
          const frameId = generateFrameId(nextState);
          nextState = frameId.state;
          const continuationFrame: EffectStackFrame = {
            ...topFrame,
            id: frameId.id,
            phase: "INTERRUPTED_BY_TRIGGERS",
            validTargets: [],
            priorActionSucceeded: false,
            accumulatedEvents: [...events],
          };
          nextState = insertFrameAt(nextState, stackDepthAfterPop, continuationFrame);
          if (isGameTerminated(nextState)) {
            return { kind: "terminal", state: nextState, events, resolved: false };
          }
          const damage = nextState.effectStack[stackDepthAfterPop + 1];
          if (damage?.effectDamage) {
            nextState = {
              ...nextState,
              effectStack: nextState.effectStack.map((frame, index) =>
                index === stackDepthAfterPop + 1
                  ? { ...frame, effectDamage: { ...frame.effectDamage!, parentFrameId: frameId.id } }
                  : frame
              ),
            };
          }
        } else if (!replacementFrameWasPushed) {
          const promptCtx = pendingPrompt.resumeContext as ResumeContext;
          const frameId = generateFrameId(nextState);
          nextState = frameId.state;
          const replacementFrame: EffectStackFrame = {
            ...topFrame,
            id: frameId.id,
            sourceCardInstanceId: promptCtx.effectSourceInstanceId,
            controller: promptCtx.controller,
            phase: promptTypeToPhase(pendingPrompt.options.promptType),
            pausedAction: promptCtx.pausedAction,
            remainingActions: topFrame.remainingActions,
            resultRefs: promptCtx.resultRefs,
            validTargets: promptCtx.validTargets,
            returnToDeckArrangement: promptCtx.returnToDeckArrangement,
            fieldToLifeTargetIds: promptCtx.fieldToLifeTargetIds,
            giveDonIdentity: promptCtx.giveDonIdentity,
            accumulatedEvents: [...events],
            playOverflow: promptCtx.ruleTrashForPlay,
            stateDistributionForPlay: promptCtx.stateDistributionForPlay,
          };
          nextState = pushFrame(nextState, replacementFrame);
          if (isGameTerminated(nextState)) {
            return { kind: "terminal", state: nextState, events, resolved: false };
          }
          pendingPrompt = {
            ...pendingPrompt,
            resumeContext: replacementFrame.id,
          };
        } else {
          nextState = retainEventsOnFrame(nextState, stackDepthAfterPop, events);
          nextState = updateEffectContinuation(nextState, stackDepthAfterPop, frame => ({
            pendingTriggers: [...frame.pendingTriggers, ...topFrame.pendingTriggers],
            triggerOrderingGroup: topFrame.triggerOrderingGroup ?? frame.triggerOrderingGroup,
          }));
        }
        return { kind: "waiting",
          state: nextState,
          events,
          resolved: false,
          pendingPrompt,
          rejected: result.rejected,
          ...(result.reprompted ? { reprompted: true } : {}),
        };
      }

      // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
      if (result.events.length > 0) {
        const chainScan = scanEventsForTriggers(
          nextState,
          result.events,
          controller,
          cardDb
        );
        nextState = chainScan.state;
        replacePendingEventReferences(events, result.events, chainScan.events);
        if (chainScan.triggers.length > 0) {
          const allTriggers = [
            ...chainScan.triggers,
            ...topFrame.pendingTriggers,
          ];
          return services.reportTriggers(
            nextState,
            allTriggers,
            cardDb,
            events
          );
        }
      }

      return services.reportTriggers(
        nextState,
        topFrame.pendingTriggers,
        cardDb,
        events,
        topFrame.triggerOrderingGroup
      );
    }

    // ── Interrupted by nested triggers (triggers have completed, resume) ─
    case "INTERRUPTED_BY_TRIGGERS": {
      const events = pendingPropagationEvents(topFrame.accumulatedEvents);
      if (topFrame.eventActivation)
        events.push(...topFrame.eventActivation.events);
      let nextState = popFrame(state);
      const stackDepthAfterPop = nextState.effectStack.length;

      if (topFrame.remainingActions.length > 0) {
        const resultRefs = new Map<string, EffectResult>(topFrame.resultRefs);
        const chainResult = services.withCommittedEvents(events).executeActionChain(
          nextState,
          topFrame.remainingActions,
          sourceCardInstanceId,
          controller,
          cardDb,
          resultRefs,
          topFrame.effectDescription,
          topFrame.priorActionSucceeded ?? true
        );
        nextState = chainResult.state;
        events.push(...chainResult.events);

        if (chainResult.pendingPrompt) {
          nextState = retainEventsOnFrame(nextState, stackDepthAfterPop, events);
          return { kind: "waiting",
            state: nextState,
            events,
            resolved: false,
            pendingPrompt: chainResult.pendingPrompt,
          };
        }
      }

      // Publication and trigger scanning are independent obligations. A saved
      // prefix may already be logged, including an event-only continuation.
      if (events.length > 0) {
        const scan = scanEventsForTriggers(nextState, events, controller, cardDb);
        nextState = scan.state;
        events.splice(0, events.length, ...scan.events);
        if (scan.triggers.length > 0) {
          return services.reportTriggers(
            nextState,
            [...scan.triggers, ...topFrame.pendingTriggers],
            cardDb,
            events,
            topFrame.triggerOrderingGroup
          );
        }
      }

      return services.reportTriggers(
        nextState,
        topFrame.pendingTriggers,
        cardDb,
        events,
        topFrame.triggerOrderingGroup
      );
    }

    case "AWAITING_TRIGGER_ORDER_SELECTION":
      return handleAwaitingTriggerOrderSelection(state, action, cardDb);

    case "AWAITING_BATCH_RESUME":
      return services.continueHandler(state, cardDb);

    default:
      return { kind: "waiting", state, events: [], resolved: false };
  }
}
