import { finishReplacedLifeCost } from "../cost/replaced.js";
import { completeHandTrashCostSources, handTrashEvent, isHandTrashByEffect } from "../../hand-trash.js";
import {
  updateEffectContinuation,
  withdrawUnactivatedTrashMain,
} from "../event-activation.js";
import { effectSourceIdentity } from "../../effect-source.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "../../effect-types.js";
/**
 * AWAITING_COST_SELECTION resume — handles the player's response to a cost
 * prompt (CHOOSE_ONE_COST branch pick, CHOICE branch pick, LIFE_TO_HAND
 * position, or generic SELECT_TARGET cost payment). Each branch either
 * re-enters payCostsWithSelection with the chosen/replaced cost, or applies
 * the target selection directly, then continues paying any remaining costs
 * and finally executes the effect's action chain.
 */

import { namedPlayCandidates, payNamedPlay } from "../cost/named-play.js";
import { trashCharacter } from "../card-mutations.js";
import { retainEventsOnFrame, publishCommittedEvents } from "./events.js";
import type {
  ChoiceCost,
  Cost,
  CostResult,
  EffectResult,
  SimpleCost,
} from "../../effect-types.js";
import { isOncePerTurnBlock } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  EffectStackFrame,
} from "../../../types.js";
import { popFrame, peekFrame, updateTopFrame } from "../../effect-stack.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { markOncePerTurnUsed } from "../action-utils.js";
import {
  payCostsWithSelection,
  payCosts,
  applyCostSelection,
  blockShufflesDeck,
  buildTrashToDeckArrangePrompt,
} from "../cost-handler.js";
import { COST_DON_GIVEN_REF, costResultToEntries, costResultRefsFromEntries } from "../types.js";
import { computeCostTargets, costSelectionCount, isOpponentLifePlacement } from "../cost/targets.js";

const LIFE_DESTINATION_CHOICE_PREFIX = "cost-life:";

/** OPT-828: a Life-end choice id bound to the Characters chosen to pay the cost. */
function lifeDestinationChoiceId(ids: string[], end: "TOP" | "BOTTOM"): string {
  return `${LIFE_DESTINATION_CHOICE_PREFIX}${JSON.stringify(ids)}:${end}`;
}

function isLifeDestinationChoiceId(id: string): boolean {
  return id.startsWith(LIFE_DESTINATION_CHOICE_PREFIX);
}

function parseLifeDestinationChoiceId(
  id: string,
): { ids: string[]; position: "TOP" | "BOTTOM" } | null {
  if (!isLifeDestinationChoiceId(id)) return null;
  const split = id.lastIndexOf(":");
  const end = id.slice(split + 1);
  if (end !== "TOP" && end !== "BOTTOM") return null;
  try {
    const ids: unknown = JSON.parse(id.slice(LIFE_DESTINATION_CHOICE_PREFIX.length, split));
    if (!Array.isArray(ids) || !ids.every((value) => typeof value === "string")) return null;
    return { ids, position: end };
  } catch {
    return null;
  }
}
import { postCostConditionsMet } from "../post-cost.js";
import type { EffectResolverResult, EffectResolverServices } from "../types.js";
import {
  checkReplacementForKO,
  checkReplacementForRemoval,
} from "../../replacements.js";
import { getEventCardInstanceId, replacePendingEventReferences } from "../../events.js";
import { transitionCards } from "../../zone-transition.js";
import {
  applyCostTransactionState,
  captureCostTransactionState,
  stagedProhibitionView,
  type CostTransactionState,
} from "../cost/transaction.js";

/**
 * Frames persisted before OPT-614 have no staged state. Earlier costs are
 * already committed to the root and cannot be reconstructed, so abandon must
 * publish their retained events instead of pretending those mutations rolled
 * back. Result refs cover silent payments such as REST_DON.
 */
function isLegacyCostTransactionFrame(frame: EffectStackFrame): boolean {
  return frame.costTransactionState === undefined && (
    frame.currentCostIndex > 0 ||
    frame.accumulatedEvents.length > 0 ||
    frame.costResultRefs.some(([, result]) => result.count > 0)
  );
}

function eventsForCostAbandon(
  frame: EffectStackFrame,
  additionalEvents: PendingEvent[] = [],
): PendingEvent[] {
  return isLegacyCostTransactionFrame(frame)
    ? [...frame.accumulatedEvents, ...additionalEvents]
    : additionalEvents;
}

export function abortReplacedCost(
  state: GameState,
  frame: EffectStackFrame,
  events: PendingEvent[],
  cardDb: Map<string, CardData>,
  services: EffectResolverServices,
  frameOnStack = true
): EffectResolverResult {
  const nextState = withdrawUnactivatedTrashMain(
    frameOnStack ? popFrame(state) : state,
    frame
  );
  return services.processRemainingTriggers(
    nextState,
    frame.pendingTriggers,
    cardDb,
    eventsForCostAbandon(frame, events),
  );
}

/**
 * Merge a new set of cost result refs (from a payCostsWithSelection call)
 * into an accumulated refs map. Concatenates targetInstanceIds and sums
 * counts per key.
 */
function mergeCostRefs(
  accumulated: Map<string, EffectResult>,
  newResult: CostResult | undefined
): Map<string, EffectResult> {
  if (!newResult) return accumulated;
  const newRefs = costResultRefsFromEntries(costResultToEntries(newResult));
  if (!newRefs) return accumulated;
  for (const [key, val] of newRefs) {
    const existing = accumulated.get(key);
    accumulated.set(
      key,
      existing
        ? {
            targetInstanceIds: [
              ...existing.targetInstanceIds,
              ...val.targetInstanceIds,
            ],
            count: existing.count + val.count,
          }
        : val
    );
  }
  return accumulated;
}

/**
 * Shared tail for all AWAITING_COST_SELECTION branches that consumed one cost
 * and now need to pay any remaining costs, then execute the effect's action
 * chain. Runs once the current cost has been resolved.
 */
function finishCostsAndRunActions(
  state: GameState,
  events: PendingEvent[],
  topFrame: EffectStackFrame,
  costRefs: Map<string, EffectResult>,
  controller: 0 | 1,
  sourceCardInstanceId: string,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  const block = topFrame.effectBlock;
  if (isOncePerTurnBlock(block) && !topFrame.oncePerTurnMarked) {
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  }

  // Cost prompts preserve the frame's seeded references (notably the exact
  // card that triggered an [On K.O.] effect) separately from cost result
  // references. Recombine both before starting the action chain so paying a
  // selectable cost cannot erase trigger identity.
  const actionRefs = new Map<string, EffectResult>(topFrame.resultRefs);
  for (const [key, value] of costRefs) actionRefs.set(key, value);
  const refsForActions = actionRefs.size > 0 ? actionRefs : undefined;

  // OPT-453: cost payments on the prompt-resume path never flow back through
  // the pipeline's event scan (GameSession keeps resumeResult.state and drops
  // its events) — scan this resume's cost-payment events here so
  // event-watching auto effects (e.g. OP16-041's removed-from-field watcher,
  // OPT-224's becomes-rested watchers) queue exactly as they do when the same
  // cost auto-pays inside a pipeline run. `events` holds only events produced
  // by this resume invocation, so nothing is scanned twice.
  // Canonical hand-trash costs carry count + causal source, not a Character
  // identity. Admit them alongside identity-bearing field exits; legacy
  // bookkeeping events remain excluded. Character-only matchers reject HAND.
  completeHandTrashCostSources(events, state, sourceCardInstanceId, controller, actionRefs);
  const scannable = events.filter(
    (e) =>
    e.type !== "CARD_TRASHED" || Boolean(getEventCardInstanceId(e)) || isHandTrashByEffect(e)
  );
  let pendingTriggers = topFrame.pendingTriggers;
  if (scannable.length > 0) {
    const costScan = scanEventsForTriggers(
      state,
      scannable,
      controller,
      cardDb
    );
    state = costScan.state;
    replacePendingEventReferences(events, scannable, costScan.events);
    if (costScan.triggers.length > 0) {
      pendingTriggers = [...pendingTriggers, ...costScan.triggers];
    }
  }

  // OPT-437: the post-colon "If" gate — costs are fully paid at this point
  // and the chain is about to start; when false, skip every action (the paid
  // cost stands) but still drain queued triggers.
  if (
    !postCostConditionsMet(
      state,
      block,
      sourceCardInstanceId,
      controller,
      cardDb
    )
  ) {
    return services.processRemainingTriggers(
      state,
      pendingTriggers,
      cardDb,
      events
    );
  }

  if (topFrame.remainingActions.length > 0) {
    const stackDepth = state.effectStack.length;
    const chainResult = services.withCommittedEvents(events).executeActionChain(
      state,
      topFrame.remainingActions,
      sourceCardInstanceId,
      controller,
      cardDb,
      refsForActions,
      topFrame.effectDescription,
    );
    state = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      state = retainEventsOnFrame(state, stackDepth, events);
      state = updateEffectContinuation(state, stackDepth, () => ({
        pendingTriggers, triggerOrderingGroup: topFrame.triggerOrderingGroup,
      }));
      return {
        state,
        events,
        resolved: false,
        pendingPrompt: chainResult.pendingPrompt,
      };
    }

    // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
    if (chainResult.events.length > 0) {
      const chainScan = scanEventsForTriggers(
        state,
        chainResult.events,
        controller,
        cardDb
      );
      state = chainScan.state;
      replacePendingEventReferences(
        events,
        chainResult.events,
        chainScan.events
      );
      if (chainScan.triggers.length > 0) {
        const allTriggers = [...chainScan.triggers, ...pendingTriggers];
        return services.processRemainingTriggers(
          state,
          allTriggers,
          cardDb,
          events
        );
      }
    }
  }

  return services.processRemainingTriggers(
    state,
    pendingTriggers,
    cardDb,
    events
  );
}

/**
 * Resume after a CHOOSE_ONE_COST or CHOICE cost-branch pick. Replaces the
 * current cost slot with the chosen option (CHOOSE_ONE_COST replaces with
 * one cost, CHOICE splices in a branch of 1+ costs), then re-enters
 * payCostsWithSelection at the same index.
 */
function resumeAfterBranchPick(
  state: GameState,
  transactionBaseline: CostTransactionState,
  topFrame: EffectStackFrame,
  replacedCosts: Cost[],
  controller: 0 | 1,
  sourceCardInstanceId: string,
  accumulatedCostRefs: Map<string, EffectResult>,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  const events: PendingEvent[] = [...topFrame.accumulatedEvents];
  let nextState = popFrame(state);

  const block = topFrame.effectBlock;
  const resumeResult = payCostsWithSelection(
    nextState,
    replacedCosts,
    topFrame.currentCostIndex,
    controller,
    cardDb,
    sourceCardInstanceId,
    block,
    services,
    topFrame.effectDescription,
    transactionBaseline,
    events,
  );

  if (resumeResult.replaced) {
    return finishReplacedLifeCost(
      resumeResult.state,
      resumeResult.events,
      topFrame.effectBlock,
      sourceCardInstanceId,
      controller,
      topFrame.pendingTriggers,
      cardDb,
      services,
      new Map(topFrame.resultRefs),
      topFrame.triggerOrderingGroup,
    );
  }

  if (resumeResult.cannotPay) {
    return services.processRemainingTriggers(
      withdrawUnactivatedTrashMain(resumeResult.state, topFrame),
      topFrame.pendingTriggers,
      cardDb,
      eventsForCostAbandon(topFrame, resumeResult.events),
    );
  }

  nextState = resumeResult.state;
  events.length = 0;
  events.push(...resumeResult.events);

  if (resumeResult.pendingPrompt) {
    const newTop = peekFrame(nextState);
    if (newTop) {
      nextState = updateTopFrame(nextState, {
        resultRefs: topFrame.resultRefs,
        costResultRefs: topFrame.costResultRefs,
        pendingTriggers: topFrame.pendingTriggers,
      });
    }
    return {
      state: nextState,
      events,
      resolved: false,
      pendingPrompt: resumeResult.pendingPrompt,
    };
  }

  const mergedRefs = mergeCostRefs(
    new Map(accumulatedCostRefs),
    resumeResult.costResult
  );
  return finishCostsAndRunActions(
    nextState,
    events,
    topFrame,
    mergedRefs,
    controller,
    sourceCardInstanceId,
    cardDb,
    services
  );
}

export function handleAwaitingCostSelection(
  state: GameState,
  action: GameAction,
  topFrame: EffectStackFrame,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  const { sourceCardInstanceId, controller } = topFrame;
  const cost = topFrame.costs[topFrame.currentCostIndex];
  const baselineState = state;
  const transactionBaseline = captureCostTransactionState(baselineState);
  const workingState = topFrame.costTransactionState
    ? applyCostTransactionState(baselineState, topFrame.costTransactionState)
    : baselineState;
  const suspendCurrentFrame = (
    stateWithFrame: GameState,
    stagedEvents: PendingEvent[],
    pendingPrompt: NonNullable<EffectResolverResult["pendingPrompt"]>,
    stagedState: GameState = stateWithFrame,
  ): EffectResolverResult => {
    const withTransaction = updateTopFrame(stateWithFrame, {
      accumulatedEvents: [...stagedEvents],
      costTransactionState: captureCostTransactionState(stagedState),
    });
    return {
      state: applyCostTransactionState(withTransaction, transactionBaseline),
      events: [],
      resolved: false,
      pendingPrompt,
    };
  };

  // Reconstruct accumulated cost refs from the frame
  const accumulatedCostRefs = new Map<string, EffectResult>(
    topFrame.costResultRefs
  );

  if (
    action.type === "PLAYER_CHOICE" &&
    action.choiceId === "skip" &&
    (cost.type === "REST_DON" || cost.type === "DON_REST") &&
    cost.amount === "ANY_NUMBER"
  ) {
    return services.processRemainingTriggers(
      withdrawUnactivatedTrashMain(popFrame(baselineState), topFrame),
      topFrame.pendingTriggers,
      cardDb,
      eventsForCostAbandon(topFrame),
    );
  }

  if (
    action.type === "PLAYER_CHOICE" &&
    action.choiceId === "__PAY_FIXED_COST__"
  ) {
    let nextState = popFrame(workingState);
    const events: PendingEvent[] = [...topFrame.accumulatedEvents];
    const paid = payCosts(
      nextState,
      [cost],
      controller,
      cardDb,
      sourceCardInstanceId
    );
    if (!paid) {
      return services.processRemainingTriggers(
        withdrawUnactivatedTrashMain(popFrame(baselineState), topFrame),
        topFrame.pendingTriggers,
        cardDb,
        eventsForCostAbandon(topFrame),
      );
    }
    nextState = paid.state;
    events.push(...paid.events);
    if (paid.replaced) {
      return finishReplacedLifeCost(
        nextState,
        events,
        topFrame.effectBlock,
        sourceCardInstanceId,
        controller,
        topFrame.pendingTriggers,
        cardDb,
        services,
        new Map(topFrame.resultRefs),
        topFrame.triggerOrderingGroup,
      );
    }
    mergeCostRefs(accumulatedCostRefs, paid.costResult);
    const nextCostIndex = topFrame.currentCostIndex + 1;
    if (nextCostIndex < topFrame.costs.length) {
      const remaining = payCostsWithSelection(
        nextState,
        topFrame.costs,
        nextCostIndex,
        controller,
        cardDb,
        sourceCardInstanceId,
        topFrame.effectBlock,
        services,
        topFrame.effectDescription,
        transactionBaseline,
        events,
      );
      if (remaining.replaced) {
        return finishReplacedLifeCost(
          remaining.state,
          remaining.events,
          topFrame.effectBlock,
          sourceCardInstanceId,
          controller,
          topFrame.pendingTriggers,
          cardDb,
          services,
          new Map(topFrame.resultRefs),
          topFrame.triggerOrderingGroup,
        );
      }

      if (remaining.cannotPay) {
        return services.processRemainingTriggers(
          withdrawUnactivatedTrashMain(remaining.state, topFrame),
          topFrame.pendingTriggers,
          cardDb,
          eventsForCostAbandon(topFrame),
        );
      }
      nextState = remaining.state;
      events.push(...remaining.events);
      if (remaining.pendingPrompt) {
        return {
          state: nextState,
          events: remaining.events,
          resolved: false,
          pendingPrompt: remaining.pendingPrompt,
        };
      }
      events.length = 0;
      events.push(...remaining.events);
      mergeCostRefs(accumulatedCostRefs, remaining.costResult);
    }
    return finishCostsAndRunActions(
      nextState,
      events,
      topFrame,
      accumulatedCostRefs,
      controller,
      sourceCardInstanceId,
      cardDb,
      services
    );
  }

  // CHOOSE_ONE_COST — player chose which option to pay; replace slot and re-enter.
  if (action.type === "PLAYER_CHOICE" && cost.type === "CHOOSE_ONE_COST") {
    const options = cost.options ?? [];
    const choiceIdx = Number(action.choiceId);
    const chosen = options[choiceIdx];
    if (!chosen) {
      return { state, events: [], resolved: false };
    }

    const replacedCosts = [...topFrame.costs];
    replacedCosts[topFrame.currentCostIndex] = chosen;

    return resumeAfterBranchPick(
      workingState,
      transactionBaseline,
      topFrame,
      replacedCosts,
      controller,
      sourceCardInstanceId,
      accumulatedCostRefs,
      cardDb,
      services
    );
  }

  // OPT-372: PLACE_FROM_TRASH_TO_DECK with position TOP_OR_BOTTOM — the
  // player picked a destination. Pin it on the cost and re-enter the payment
  // flow (mirrors the CHOOSE_ONE_COST slot replacement); the select/arrange
  // stages then run with a concrete position.
  if (
    action.type === "PLAYER_CHOICE" &&
    cost.type === "PLACE_FROM_TRASH_TO_DECK" &&
    cost.position === "TOP_OR_BOTTOM"
  ) {
    // Only the two emitted ids are valid — a stale/malformed choiceId must
    // leave the prompt unresolved, not default to TOP.
    if (action.choiceId !== "0" && action.choiceId !== "1") {
      return { state, events: [], resolved: false };
    }
    const position = action.choiceId === "1" ? "BOTTOM" : "TOP";
    const replacedCosts = [...topFrame.costs];
    replacedCosts[topFrame.currentCostIndex] = { ...cost, position };

    return resumeAfterBranchPick(
      workingState,
      transactionBaseline,
      topFrame,
      replacedCosts,
      controller,
      sourceCardInstanceId,
      accumulatedCostRefs,
      cardDb,
      services
    );
  }

  // CHOICE — player chose a branch; splice that branch's costs in and re-enter.
  if (action.type === "PLAYER_CHOICE" && cost.type === "CHOICE") {
    const choiceCost = cost as ChoiceCost;
    const branchIdx = Number(action.choiceId);
    const branch = choiceCost.options[branchIdx];
    if (!branch) {
      return { state, events: [], resolved: false };
    }

    const replacedCosts = [...topFrame.costs];
    replacedCosts.splice(topFrame.currentCostIndex, 1, ...branch);

    return resumeAfterBranchPick(
      workingState,
      transactionBaseline,
      topFrame,
      replacedCosts,
      controller,
      sourceCardInstanceId,
      accumulatedCostRefs,
      cardDb,
      services
    );
  }

  // ── LIFE_TO_HAND / generic SELECT_TARGET cost payment ────────────────────
  const events: PendingEvent[] = [...topFrame.accumulatedEvents];
  let nextState = workingState;

  if (cost.type === "PLAY_NAMED_CARD_FROM_HAND") {
    const reject = (): EffectResolverResult => ({ state, events: [], resolved: false, rejected: true });
    if (action.type !== "SELECT_TARGET" || action.selectedInstanceIds?.length !== 1) return reject();
    const selected = action.selectedInstanceIds[0];
    if (!topFrame.validTargets.includes(selected)) return reject();
    const handId = topFrame.namedPlayCostTargetId ?? selected;
    // Check both the live and staged states: persistence must not resurrect
    // a hand identity that disappeared or became prohibited after the offer.
    if (!namedPlayCandidates(baselineState, cost, controller, cardDb).includes(handId) ||
        !namedPlayCandidates(nextState, cost, controller, cardDb).includes(handId)) return reject();
    if (topFrame.namedPlayCostTargetId) {
      if (!baselineState.players[controller].characters.some(card => card?.instanceId === selected) ||
          !nextState.players[controller].characters.some(card => card?.instanceId === selected)) return reject();
      // Rule 3-7-6-1-1: this is rule processing, so no replacement check.
      const trashed = trashCharacter(nextState, selected, controller, "rule");
      if (!trashed) return reject();
      nextState = trashed.state;
      events.push(...trashed.events);
    } else if (!nextState.players[controller].characters.includes(null)) {
      const cards = nextState.players[controller].characters.filter(card => card !== null);
      const validTargets = cards.map(card => card.instanceId);
      const handCard = nextState.players[controller].hand.find(card => card.instanceId === handId)!;
      // The intended card is public before rule-trash selection (3-7-6-1).
      // Revelation is committed information, while zone payment remains staged.
      const revealed: PendingEvent[] = [{ type: "CARDS_REVEALED", playerIndex: controller,
        payload: { cards: [{ instanceId: handId, cardId: handCard.cardId }], source: "HAND", visibility: "BOTH" } }];
      nextState = publishCommittedEvents(nextState, revealed);
      events.push(...revealed);
      nextState = updateTopFrame(nextState, { namedPlayCostTargetId: handId, validTargets });
      return suspendCurrentFrame(nextState, events, {
        options: {
          promptType: "SELECT_TARGET", cards, validTargets, countMin: 1, countMax: 1,
          effectDescription: "Character area is full. Choose one of your Characters to trash (rule 3-7-6-1).",
          instruction: "Trash 1 of your Characters.", ctaLabel: "Confirm",
        },
        respondingPlayer: controller, resumeContext: topFrame.id,
      });
    }
    const paid = payNamedPlay(nextState, cost, handId, controller, cardDb);
    if (!paid) return reject();
    nextState = paid.state;
    events.push(...paid.events);
  } else if (
    action.type === "PLAYER_CHOICE" &&
    (cost.type === "REST_DON" || cost.type === "DON_REST") &&
    cost.amount === "ANY_NUMBER"
  ) {
    if (!topFrame.validTargets.includes(action.choiceId)) {
      return { state, events: [], resolved: false };
    }
    const amount = Number(action.choiceId.replace("don-rest:", ""));
    if (!Number.isInteger(amount) || amount <= 0) {
      return { state, events: [], resolved: false };
    }
    const paid = payCosts(
      nextState,
      [{ ...cost, amount }],
      controller,
      cardDb,
      sourceCardInstanceId
    );
    if (!paid) {
      return { state, events: [], resolved: false };
    }
    nextState = paid.state;
    events.push(...paid.events);
    mergeCostRefs(accumulatedCostRefs, paid.costResult);
  // LIFE_TO_HAND / TRASH_FROM_LIFE with TOP_OR_BOTTOM — player chose a position
  } else if (
    action.type === "PLAYER_CHOICE" &&
    (cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE")
  ) {
    if (action.choiceId !== "0" && action.choiceId !== "1") {
      return { state, events: [], resolved: false };
    }
    const position = action.choiceId === "1" ? "BOTTOM" : "TOP";
    const paid = payCosts(
      nextState, [{ ...cost, position }], controller, cardDb, sourceCardInstanceId
    );
    if (!paid) {
      return services.processRemainingTriggers(
        withdrawUnactivatedTrashMain(popFrame(baselineState), topFrame),
        topFrame.pendingTriggers,
        cardDb,
        eventsForCostAbandon(topFrame)
      );
    }
    nextState = paid.state;
    events.push(...paid.events);
    mergeCostRefs(accumulatedCostRefs, paid.costResult);
    if (paid.replaced) {
      return finishReplacedLifeCost(
        popFrame(nextState),
        events,
        topFrame.effectBlock,
        sourceCardInstanceId,
        controller,
        topFrame.pendingTriggers,
        cardDb,
        services,
        new Map(topFrame.resultRefs),
        topFrame.triggerOrderingGroup,
      );
    }
  } else if (
    action.type === "SELECT_TARGET" &&
    cost.type === "PLACE_FROM_TRASH_TO_DECK"
  ) {
    // OPT-371: the player chose WHICH trash cards to place. For multi-card
    // costs (unless the block shuffles afterward) chain an arrange prompt so
    // the player also sets the ORDER — the frame stays on the stack and the
    // ARRANGE_TOP_CARDS response below finishes the payment.
    if (topFrame.costArrangeStage) {
      // Awaiting an arrange response — a select packet here could bypass
      // the ordering step. Ignore it.
      return { state, events: [], resolved: false };
    }
    const valid = new Set(topFrame.validTargets ?? []);
    const amount =
      typeof (cost as SimpleCost).amount === "number"
        ? ((cost as SimpleCost).amount as number)
        : 1;
    const selected = [...new Set(action.selectedInstanceIds ?? [])].filter(
      (id) => valid.has(id)
    );
    if (selected.length !== amount) {
      return { state, events: [], resolved: false };
    }

    const needsArrange = amount > 1 && !blockShufflesDeck(topFrame.effectBlock);
    if (needsArrange) {
      nextState = updateTopFrame(nextState, {
        validTargets: selected,
        costArrangeStage: true,
      });
      return suspendCurrentFrame(
        nextState,
        events,
        buildTrashToDeckArrangePrompt(
          nextState,
          selected,
          controller,
          topFrame.id,
          (cost as SimpleCost).position === "TOP" ? "TOP" : "BOTTOM"
        ),
      );
    }

    const appliedTrash = applyCostSelection(
      nextState,
      cost,
      selected,
      controller, cardDb);
    nextState = appliedTrash.state;
    events.push(...appliedTrash.events);
    const existing = accumulatedCostRefs.get("__cost_cards_placed_to_deck") ?? {
      targetInstanceIds: [],
      count: 0,
    };
    accumulatedCostRefs.set("__cost_cards_placed_to_deck", {
      targetInstanceIds: existing.targetInstanceIds,
      count: existing.count + selected.length,
    });
  } else if (
    action.type === "SELECT_TARGET" &&
    (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" ||
      cost.type === "PLACE_SELF_AND_HAND_TO_DECK")
  ) {
    // OPT-431/OPT-430: the player chose WHICH trash cards join the source
    // Character. The self half is fixed — selections are validated against
    // the trash-only validTargets, so the source can never be substituted.
    // Unless the block shuffles afterward, chain an arrange prompt covering
    // the WHOLE group (self + trash) per Comprehensive Rule 3-1-7.
    if (topFrame.costArrangeStage) {
      return { state, events: [], resolved: false };
    }
    const valid = new Set(topFrame.validTargets ?? []);
    const amount =
      typeof (cost as SimpleCost).amount === "number"
        ? ((cost as SimpleCost).amount as number)
        : 1;
    const selected = [...new Set(action.selectedInstanceIds ?? [])].filter(
      (id) => valid.has(id)
    );
    if (selected.length !== amount) {
      return { state, events: [], resolved: false };
    }

    const group = [sourceCardInstanceId, ...selected];
    if (!blockShufflesDeck(topFrame.effectBlock)) {
      nextState = updateTopFrame(nextState, {
        validTargets: group,
        costArrangeStage: true,
      });
      return suspendCurrentFrame(
        nextState,
        events,
        buildTrashToDeckArrangePrompt(
          nextState,
          group,
          controller,
          topFrame.id,
          (cost as SimpleCost).position === "TOP" ? "TOP" : "BOTTOM"
        ),
      );
    }

    if (!topFrame.costReplacementChecked) {
      const stagedBeforeReplacement = nextState;
      const replacement = checkReplacementForRemoval(
        applyCostTransactionState(nextState, transactionBaseline),
        sourceCardInstanceId,
        controller,
        cardDb,
        services
      );
      events.push(...replacement.events);
      nextState = replacement.state;
      if (replacement.pendingPrompt) {
        nextState = updateTopFrame(nextState, {
          costReplacementAction: {
            type: "SELECT_TARGET",
            selectedInstanceIds: selected,
          },
          costReplacementChecked: true,
        });
        return suspendCurrentFrame(
          nextState,
          events,
          replacement.pendingPrompt,
          stagedBeforeReplacement,
        );
      }
      if (replacement.replaced)
        return abortReplacedCost(
          nextState,
          topFrame,
          replacement.events,
          cardDb,
          services,
        );
      nextState = stagedBeforeReplacement;
    }

    const appliedGroup = applyCostSelection(nextState, cost, group, controller, cardDb);
    nextState = appliedGroup.state;
    events.push(...appliedGroup.events);
    const existing = accumulatedCostRefs.get("__cost_cards_placed_to_deck") ?? {
      targetInstanceIds: [],
      count: 0,
    };
    accumulatedCostRefs.set("__cost_cards_placed_to_deck", {
      targetInstanceIds: existing.targetInstanceIds,
      count: existing.count + group.length,
    });
  } else if (
    action.type === "ARRANGE_TOP_CARDS" &&
    (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" ||
      cost.type === "PLACE_SELF_AND_HAND_TO_DECK")
  ) {
    // Arranged order arrives top→bottom for the whole self+trash group.
    // Only cards staged at the select step (frame.validTargets) count; any
    // missing from the response are appended so the cost still pays in full.
    if (!topFrame.costArrangeStage) {
      return { state, events: [], resolved: false };
    }
    const valid = topFrame.validTargets ?? [];
    const validSet = new Set(valid);
    const ordered = [
      ...new Set(
        (action.orderedInstanceIds ?? []).filter((id) => validSet.has(id))
      ),
    ];
    const seen = new Set(ordered);
    for (const id of valid) {
      if (!seen.has(id)) ordered.push(id);
    }

    if (!topFrame.costReplacementChecked) {
      const stagedBeforeReplacement = nextState;
      const replacement = checkReplacementForRemoval(
        applyCostTransactionState(nextState, transactionBaseline),
        sourceCardInstanceId,
        controller,
        cardDb,
        services
      );
      events.push(...replacement.events);
      nextState = replacement.state;
      if (replacement.pendingPrompt) {
        nextState = updateTopFrame(nextState, {
          costReplacementAction: {
            type: "ARRANGE_TOP_CARDS",
            keptCardInstanceId: "",
            orderedInstanceIds: action.orderedInstanceIds,
            destination: action.destination,
          },
          costReplacementChecked: true,
        });
        return suspendCurrentFrame(
          nextState,
          events,
          replacement.pendingPrompt,
          stagedBeforeReplacement,
        );
      }
      if (replacement.replaced)
        return abortReplacedCost(
          nextState,
          topFrame,
          replacement.events,
          cardDb,
          services,
        );
      nextState = stagedBeforeReplacement;
    }

    const appliedOrdered = applyCostSelection(
      nextState,
      cost,
      ordered,
      controller, cardDb);
    nextState = appliedOrdered.state;
    events.push(...appliedOrdered.events);
    const existing = accumulatedCostRefs.get("__cost_cards_placed_to_deck") ?? {
      targetInstanceIds: [],
      count: 0,
    };
    accumulatedCostRefs.set("__cost_cards_placed_to_deck", {
      targetInstanceIds: existing.targetInstanceIds,
      count: existing.count + ordered.length,
    });
  } else if (
    action.type === "ARRANGE_TOP_CARDS" &&
    cost.type === "PLACE_FROM_TRASH_TO_DECK"
  ) {
    // OPT-371: arranged order arrives top→bottom of the placed group. Only
    // the cards picked in the selection step (frame.validTargets) count; any
    // of them missing from the response are appended so the cost still pays
    // in full.
    if (!topFrame.costArrangeStage) {
      // Still on the select stage — validTargets holds every candidate, so
      // accepting an arrange packet here would move them all. Ignore it.
      return { state, events: [], resolved: false };
    }
    const valid = topFrame.validTargets ?? [];
    const validSet = new Set(valid);
    const ordered = [
      ...new Set(
        (action.orderedInstanceIds ?? []).filter((id) => validSet.has(id))
      ),
    ];
    const seen = new Set(ordered);
    for (const id of valid) {
      if (!seen.has(id)) ordered.push(id);
    }

    const appliedOrdered = applyCostSelection(
      nextState,
      cost,
      ordered,
      controller, cardDb);
    nextState = appliedOrdered.state;
    events.push(...appliedOrdered.events);
    const existing = accumulatedCostRefs.get("__cost_cards_placed_to_deck") ?? {
      targetInstanceIds: [],
      count: 0,
    };
    accumulatedCostRefs.set("__cost_cards_placed_to_deck", {
      targetInstanceIds: existing.targetInstanceIds,
      count: existing.count + ordered.length,
    });
  } else if (cost.type === "ADD_OWN_CHARACTER_TO_LIFE" && isOpponentLifePlacement(cost)) {
    // OPT-828: OP09-101 — the payer chooses 1 of the opponent's Characters,
    // then (for TOP_OR_BOTTOM) the end of the opponent's Life it goes to.
    // Both replies are validated against the frame's offer AND against the
    // LIVE and staged payment states (as the named-play / GIVE_DON branches
    // do), so a stale, replayed or diverged reply can never move a Character
    // that left the field, stopped matching, or became protected.
    const reject = (): EffectResolverResult => ({ state, events: [], resolved: false });
    const eligibleIn = (candidateState: GameState, ids: string[]): boolean => {
      const candidates = computeCostTargets(candidateState, cost, controller, cardDb, sourceCardInstanceId);
      return ids.every((id) => candidates.includes(id));
    };
    const amount = costSelectionCount(cost);
    const destinationStage = topFrame.validTargets.some(isLifeDestinationChoiceId);
    let placedIds: string[];
    let position: "TOP" | "BOTTOM";
    if (action.type === "SELECT_TARGET") {
      if (destinationStage) return reject();
      const selected = [...new Set(action.selectedInstanceIds ?? [])];
      if (
        selected.length !== amount ||
        !selected.every((id) => topFrame.validTargets.includes(id)) ||
        !eligibleIn(baselineState, selected) ||
        !eligibleIn(nextState, selected)
      ) {
        return reject();
      }
      if (cost.position === "TOP_OR_BOTTOM") {
        // Bind the destination choices to the chosen identities (the
        // OPT-821 field-to-Life pattern). Nothing moves until the end is
        // chosen; the staged frame survives session restore.
        const choices = (["TOP", "BOTTOM"] as const).map((end) => ({
          id: lifeDestinationChoiceId(selected, end),
          label: end === "TOP" ? "Top" : "Bottom",
        }));
        nextState = updateTopFrame(nextState, { validTargets: choices.map((choice) => choice.id) });
        return suspendCurrentFrame(nextState, events, {
          options: {
            promptType: "PLAYER_CHOICE",
            effectDescription: "Choose the top or bottom of your opponent's Life cards to place the Character",
            choices,
          },
          respondingPlayer: controller,
          resumeContext: topFrame.id,
        });
      }
      placedIds = selected;
      position = cost.position === "BOTTOM" ? "BOTTOM" : "TOP";
    } else if (action.type === "PLAYER_CHOICE") {
      const parsed = destinationStage && topFrame.validTargets.includes(action.choiceId)
        ? parseLifeDestinationChoiceId(action.choiceId)
        : null;
      if (
        !parsed ||
        parsed.ids.length !== amount ||
        !eligibleIn(baselineState, parsed.ids) ||
        !eligibleIn(nextState, parsed.ids)
      ) {
        return reject();
      }
      placedIds = parsed.ids;
      position = parsed.position;
    } else {
      return reject();
    }

    if (!topFrame.costReplacementChecked) {
      // Placing the Character is an effect-caused removal; a replacement means
      // the printed cost was not paid (rules 8-3-1-3-1 / 8-3-1-7).
      const stagedBeforeReplacement = nextState;
      const replacement = checkReplacementForRemoval(
        applyCostTransactionState(nextState, transactionBaseline),
        placedIds[0],
        controller,
        cardDb,
        services
      );
      events.push(...replacement.events);
      nextState = replacement.state;
      if (replacement.pendingPrompt) {
        nextState = updateTopFrame(nextState, {
          costReplacementAction: action,
          costReplacementChecked: true,
        });
        return suspendCurrentFrame(nextState, events, replacement.pendingPrompt, stagedBeforeReplacement);
      }
      if (replacement.replaced) {
        return abortReplacedCost(nextState, topFrame, replacement.events, cardDb, services);
      }
      nextState = stagedBeforeReplacement;
    }

    const placed = applyCostSelection(
      nextState,
      { ...cost, position },
      placedIds,
      controller,
      cardDb,
      sourceCardInstanceId,
    );
    if (placed.events.length !== amount) return reject();
    nextState = placed.state;
    events.push(...placed.events);
  } else if (action.type === "SELECT_TARGET" && cost.type === "GIVE_DON") {
    // OPT-824: the player chose the single recipient of the given DON!!.
    // Accept exactly one offered card that is still an eligible recipient
    // (which also requires `amount` active DON!!) in BOTH the live state and
    // the staged payment state — mirroring the named-play branch above — so
    // a stale, replayed or diverged response can never resurrect a departed
    // recipient, spend unavailable DON!!, or pay partially or twice.
    //
    // OPT-869: the one recipient predicate runs twice with an explicit split.
    // The LIVE check guards identity, presence, target match and DON!!
    // availability only, so it reads the live board with prohibitions
    // cleared: the live state is pre-cost, and a prohibition that an earlier
    // staged cost ended (e.g. trashing an aura's source) must not veto a
    // legal payment (rule 8-3-1-1). Prohibition coverage is read once, in
    // the staged payment state, where `stagedProhibitionView` also carries
    // in any prohibition that appeared only in the live state after the offer.
    const selected = [...new Set(action.selectedInstanceIds ?? [])];
    const recipient = selected.length === 1 ? selected[0] : undefined;
    const eligibleIn = (candidateState: GameState): boolean =>
      computeCostTargets(candidateState, cost, controller, cardDb, sourceCardInstanceId).includes(recipient!);
    if (
      !recipient ||
      !topFrame.validTargets.includes(recipient) ||
      !eligibleIn({ ...baselineState, prohibitions: [] }) ||
      !eligibleIn(stagedProhibitionView(baselineState, nextState))
    ) {
      return { state, events: [], resolved: false };
    }
    const appliedGive = applyCostSelection(nextState, cost, [recipient], controller, cardDb, sourceCardInstanceId);
    if (appliedGive.events.length === 0) {
      return { state, events: [], resolved: false };
    }
    nextState = appliedGive.state;
    events.push(...appliedGive.events);
    const existing = accumulatedCostRefs.get(COST_DON_GIVEN_REF) ?? {
      targetInstanceIds: [],
      count: 0,
    };
    accumulatedCostRefs.set(COST_DON_GIVEN_REF, {
      targetInstanceIds: [...existing.targetInstanceIds, recipient],
      count: existing.count + (typeof cost.amount === "number" ? cost.amount : 1),
    });
  } else if (action.type === "SELECT_TARGET") {
    // OPT-455 review: this generic branch used to trust the client's
    // selection wholesale — an empty or out-of-offer set "paid" the cost
    // without moving anything (the frame popped and the action chain ran),
    // and a non-offered card could be substituted as payment. Enforce
    // exactly what the prompt offered, mirroring the PLACE_FROM_TRASH /
    // PLACE_SELF_AND_TRASH branches above: membership in the frame's
    // validTargets, deduped, exact prompt count (countMin === countMax ===
    // amount in the generic cost prompt).
    const valid = new Set(topFrame.validTargets ?? []);
    const amount =
      typeof (cost as SimpleCost).amount === "number"
        ? ((cost as SimpleCost).amount as number)
        : 1;
    const selected = [...new Set(action.selectedInstanceIds ?? [])].filter(
      (id) => valid.has(id)
    );
    if (selected.length !== amount) {
      return { state, events: [], resolved: false };
    }
    const fieldExitCosts = new Set<Cost["type"]>([
      "KO_OWN_CHARACTER",
      "TRASH_OWN_CHARACTER",
      "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE",
      "RETURN_OWN_CHARACTER_TO_HAND",
      "PLACE_OWN_CHARACTER_TO_DECK",
      "ADD_OWN_CHARACTER_TO_LIFE",
    ]);
    const selectedStage = state.players[controller].stage?.instanceId === selected[0];
    const selectedCardLeavesField = cost.type !== "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE" || selectedStage;
    if (fieldExitCosts.has(cost.type) && selectedCardLeavesField && !topFrame.costReplacementChecked) {
      // Cost exits are still effect-caused removal events, but a replacement
      // means the printed payment did not occur (Rules 8-3-1-3-1/8-3-1-7).
      // Park the already-validated selection on the existing cost frame.
      const stagedBeforeReplacement = nextState;
      const replacementInput = applyCostTransactionState(
        nextState,
        transactionBaseline,
      );
      let replacement =
        cost.type === "KO_OWN_CHARACTER"
          ? checkReplacementForKO(
              replacementInput,
              selected[0],
              "effect",
              controller,
              cardDb,
              services
            )
          : checkReplacementForRemoval(
              replacementInput,
              selected[0],
              controller,
              cardDb,
              services
            );
      // K.O. is also a general removal/leave-field event. Only advance to
      // that family when a K.O.-specific replacement did not intercept.
      if (
        cost.type === "KO_OWN_CHARACTER" &&
        !replacement.replaced &&
        !replacement.pendingPrompt
      ) {
        replacement = checkReplacementForRemoval(
          replacement.state,
          selected[0],
          controller,
          cardDb,
          services
        );
      }
      events.push(...replacement.events);
      nextState = replacement.state;
      if (replacement.pendingPrompt) {
        nextState = updateTopFrame(nextState, {
          costReplacementAction: {
            type: "SELECT_TARGET",
            selectedInstanceIds: selected,
          },
          costReplacementChecked: true,
        });
        return suspendCurrentFrame(
          nextState,
          events,
          replacement.pendingPrompt,
          stagedBeforeReplacement,
        );
      }
      if (replacement.replaced) {
        return abortReplacedCost(
          nextState,
          topFrame,
          replacement.events,
          cardDb,
          services,
        );
      }
      nextState = stagedBeforeReplacement;
    }
    const appliedSelected = applyCostSelection(
      nextState,
      cost,
      selected,
      controller, cardDb);
    nextState = appliedSelected.state;
    events.push(...appliedSelected.events);

    // OPT-224: a REST_CARDS / REST_NAMED_CARD cost publishes CHARACTER_BECOMES_RESTED
    // (via CARD_STATE_CHANGED) for each character transitioned ACTIVE → RESTED. Valid
    // cost targets are guaranteed active by computeCostValidTargets.
    if (cost.type === "REST_CARDS" || cost.type === "REST_NAMED_CARD") {
      for (const id of selected) {
        events.push({
          type: "CARD_STATE_CHANGED",
          playerIndex: controller,
          payload: { targetInstanceId: id, newState: "RESTED", cause: "EFFECT_COST", causingController: controller, causingSource: effectSourceIdentity(state, sourceCardInstanceId, cardDb, accumulatedCostRefs.get(EFFECT_SOURCE_SNAPSHOT_REF)?.sourceCardSnapshot) },
        });
      }
    }

    // Track selected card IDs as cost result refs based on cost type
    if (
      cost.type === "TRASH_FROM_HAND" ||
      cost.type === "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE" ||
      cost.type === "TRASH_SELF" ||
      cost.type === "TRASH_OWN_CHARACTER"
    ) {
      const existing = accumulatedCostRefs.get("__cost_cards_trashed") ?? {
        targetInstanceIds: [],
        count: 0,
      };
      accumulatedCostRefs.set("__cost_cards_trashed", {
        targetInstanceIds: [...existing.targetInstanceIds, ...selected],
        count: existing.count + selected.length,
      });
    } else if (
      cost.type === "RETURN_OWN_CHARACTER_TO_HAND" ||
      cost.type === "PLACE_OWN_CHARACTER_TO_DECK"
    ) {
      const existing = accumulatedCostRefs.get("__cost_cards_returned") ?? {
        targetInstanceIds: [],
        count: 0,
      };
      accumulatedCostRefs.set("__cost_cards_returned", {
        targetInstanceIds: [...existing.targetInstanceIds, ...selected],
        count: existing.count + selected.length,
      });
    } else if (cost.type === "KO_OWN_CHARACTER") {
      const existing = accumulatedCostRefs.get("__cost_characters_ko") ?? {
        targetInstanceIds: [],
        count: 0,
      };
      accumulatedCostRefs.set("__cost_characters_ko", {
        targetInstanceIds: [...existing.targetInstanceIds, ...selected],
        count: existing.count + selected.length,
      });
    }

    // Only trash payments publish CARD_TRASHED. Stage-side named-card payment
    // already emitted the canonical identity-bearing event via trashStage;
    // Character trash also emits one identity-bearing event per moved card.
    // Hand-side payment emits one aggregate hand-trash event with causal
    // provenance. Other selectable costs use this same resume
    // branch (including ST13-001's Character-to-Life cost), so emitting it
    // unconditionally fabricated a trash event for unrelated zone transitions.
    if (
      cost.type === "TRASH_FROM_HAND" ||
      (cost.type === "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE" && !selectedStage)
    ) {
      if (selected.length > 0) events.push(handTrashEvent(state, controller, selected.length, "COST", sourceCardInstanceId, controller, new Map(topFrame.resultRefs)));
    }
  } else {
    return { state, events: [], resolved: false };
  }

  const block = topFrame.effectBlock;
  const nextCostIndex = topFrame.currentCostIndex + 1;

  // OPT-429: this cost is fully paid — retire its frame before paying the
  // next one. payCostsWithSelection pushes a fresh frame whenever a later
  // cost prompts, so leaving the consumed frame underneath orphaned it once
  // the chain resolved (mirrors resumeAfterBranchPick, which pops first).
  nextState = popFrame(nextState);

  if (nextCostIndex < topFrame.costs.length) {
    const remainingCostResult = payCostsWithSelection(
      nextState,
      topFrame.costs,
      nextCostIndex,
      controller,
      cardDb,
      sourceCardInstanceId,
      block,
      services,
      topFrame.effectDescription,
      transactionBaseline,
      events,
    );

    if (remainingCostResult.replaced) {
      return finishReplacedLifeCost(
        remainingCostResult.state,
        remainingCostResult.events,
        topFrame.effectBlock,
        sourceCardInstanceId,
        controller,
        topFrame.pendingTriggers,
        cardDb,
        services,
        new Map(topFrame.resultRefs),
        topFrame.triggerOrderingGroup,
      );
    }

    if (remainingCostResult.cannotPay) {
      return services.processRemainingTriggers(
        withdrawUnactivatedTrashMain(remainingCostResult.state, topFrame),
        topFrame.pendingTriggers,
        cardDb,
        eventsForCostAbandon(topFrame),
      );
    }

    nextState = remainingCostResult.state;
    events.length = 0;
    events.push(...remainingCostResult.events);

    if (remainingCostResult.pendingPrompt) {
      // Persist accumulated cost refs and queued triggers into the new frame
      // (mirrors resumeAfterBranchPick — dropping pendingTriggers here would
      // lose triggers queued behind the cost chain).
      const newTop = peekFrame(nextState);
      if (newTop) {
        nextState = updateTopFrame(nextState, {
          resultRefs: topFrame.resultRefs,
          costResultRefs: [...accumulatedCostRefs.entries()].map(
            ([key, value]) => [key, value]
          ),
          pendingTriggers: topFrame.pendingTriggers,
        });
      }
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: remainingCostResult.pendingPrompt,
      };
    }

    // Merge remaining cost results into accumulated refs
    mergeCostRefs(accumulatedCostRefs, remainingCostResult.costResult);
  }

  return finishCostsAndRunActions(
    nextState,
    events,
    topFrame,
    accumulatedCostRefs,
    controller,
    sourceCardInstanceId,
    cardDb,
    services
  );
}
