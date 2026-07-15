/**
 * AWAITING_COST_SELECTION resume — handles the player's response to a cost
 * prompt (CHOOSE_ONE_COST branch pick, CHOICE branch pick, LIFE_TO_HAND
 * position, or generic SELECT_TARGET cost payment). Each branch either
 * re-enters payCostsWithSelection with the chosen/replaced cost, or applies
 * the target selection directly, then continues paying any remaining costs
 * and finally executes the effect's action chain.
 */

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
import { costResultToEntries, costResultRefsFromEntries } from "../types.js";
import { postCostConditionsMet } from "../post-cost.js";
import type { EffectResolverResult, EffectResolverServices } from "../types.js";
import {
  checkReplacementForKO,
  checkReplacementForRemoval,
} from "../../replacements.js";
import { replacePendingEventReferences } from "../../events.js";
import { transitionCards } from "../../zone-transition.js";

export function abortReplacedCost(
  state: GameState,
  frame: EffectStackFrame,
  events: PendingEvent[],
  cardDb: Map<string, CardData>,
  services: EffectResolverServices,
  frameOnStack = true
): EffectResolverResult {
  let nextState = frameOnStack ? popFrame(state) : state;
  const block = frame.effectBlock;
  if (isOncePerTurnBlock(block) && !frame.oncePerTurnMarked) {
    nextState = markOncePerTurnUsed(
      nextState,
      block.id,
      frame.sourceCardInstanceId
    );
  }
  return services.processRemainingTriggers(
    nextState,
    frame.pendingTriggers,
    cardDb,
    events
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
  // The legacy count-only CARD_TRASHED bookkeeping event (pushed for every
  // generic SELECT_TARGET cost, including hand trashes) carries no instance
  // id and must not reach trigger matching — ANY_CHARACTER_TRASHED watchers
  // would false-fire on hand trashes. Instance-bearing trash events scan.
  const scannable = events.filter(
    (e) =>
    e.type !== "CARD_TRASHED" ||
      !!(e.payload as { cardInstanceId?: string } | undefined)?.cardInstanceId
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
    const chainResult = services.executeActionChain(
      state,
      topFrame.remainingActions,
      sourceCardInstanceId,
      controller,
      cardDb,
      refsForActions
    );
    state = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      const newTop = peekFrame(state);
      if (newTop) {
        state = updateTopFrame(state, { pendingTriggers });
      }
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
  topFrame: EffectStackFrame,
  replacedCosts: Cost[],
  controller: 0 | 1,
  sourceCardInstanceId: string,
  accumulatedCostRefs: Map<string, EffectResult>,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  const events: PendingEvent[] = [];
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
    services
  );

  if (resumeResult.cannotPay) {
    return services.processRemainingTriggers(
      resumeResult.state,
      topFrame.pendingTriggers,
      cardDb,
      events
    );
  }

  nextState = resumeResult.state;
  events.push(...resumeResult.events);

  if (resumeResult.pendingPrompt) {
    const newTop = peekFrame(nextState);
    if (newTop) {
      nextState = updateTopFrame(nextState, {
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

  // Reconstruct accumulated cost refs from the frame
  const accumulatedCostRefs = new Map<string, EffectResult>(
    topFrame.costResultRefs
  );

  if (
    action.type === "PLAYER_CHOICE" &&
    action.choiceId === "__PAY_FIXED_COST__"
  ) {
    let nextState = popFrame(state);
    const events: PendingEvent[] = [];
    const paid = payCosts(
      nextState,
      [cost],
      controller,
      cardDb,
      sourceCardInstanceId
    );
    if (!paid) {
      return abortReplacedCost(
        nextState,
        topFrame,
        events,
        cardDb,
        services,
        false
      );
    }
    nextState = paid.state;
    events.push(...paid.events);
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
        services
      );
      if (remaining.cannotPay) {
        return abortReplacedCost(
          remaining.state,
          topFrame,
          [...events, ...remaining.events],
          cardDb,
          services,
          false
        );
      }
      nextState = remaining.state;
      events.push(...remaining.events);
      if (remaining.pendingPrompt) {
        return {
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: remaining.pendingPrompt,
        };
      }
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
      state,
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
      state,
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
      state,
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
  const events: PendingEvent[] = [];
  let nextState = state;

  // LIFE_TO_HAND / TRASH_FROM_LIFE with TOP_OR_BOTTOM — player chose a position
  if (
    action.type === "PLAYER_CHOICE" &&
    (cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE")
  ) {
    const position = action.choiceId === "1" ? "BOTTOM" : "TOP";
    const p = nextState.players[controller];
    if (p.life.length === 0) {
      nextState = popFrame(nextState);
      return services.processRemainingTriggers(
        nextState,
        topFrame.pendingTriggers,
        cardDb
      );
    }

    const removed = position === "TOP" ? p.life.slice(0, 1) : p.life.slice(-1);
    if (cost.type === "TRASH_FROM_LIFE") {
      const moved = transitionCards(
        nextState,
        removed.map((card) => card.instanceId),
        "TRASH",
        { position: "TOP" }
      );
      nextState = moved.state;
      const existing = accumulatedCostRefs.get("__cost_cards_trashed") ?? {
        targetInstanceIds: [],
        count: 0,
      };
      accumulatedCostRefs.set("__cost_cards_trashed", {
        targetInstanceIds: [
          ...existing.targetInstanceIds,
          ...moved.transitions.map(
            (transition) => transition.fact.newInstanceId
          ),
        ],
        count: existing.count + moved.transitions.length,
      });
      events.push({
        type: "CARD_TRASHED",
        playerIndex: controller,
        payload: { count: 1, reason: "cost", from: "LIFE" },
      });
      // OPT-240: any life exit publishes CARD_REMOVED_FROM_LIFE so
      // Kalgara/Bonney-style watchers fire on cost payments too.
      for (const transition of moved.transitions) {
        events.push({
          type: "CARD_REMOVED_FROM_LIFE",
          playerIndex: controller,
          payload: {
            cardInstanceId: transition.fact.oldInstanceId,
            newCardInstanceId: transition.fact.newInstanceId,
          },
        });
      }
    } else {
      const moved = transitionCards(
        nextState,
        removed.map((card) => card.instanceId),
        "HAND"
      );
      nextState = moved.state;
      events.push({
        type: "CARD_ADDED_TO_HAND_FROM_LIFE",
        playerIndex: controller,
        payload: { count: 1 },
      });
      // OPT-240: life exits publish CARD_REMOVED_FROM_LIFE (executeLifeToHand
      // already does; the cost path was missing it).
      for (const transition of moved.transitions) {
        events.push({
          type: "CARD_REMOVED_FROM_LIFE",
          playerIndex: controller,
          payload: {
            cardInstanceId: transition.fact.oldInstanceId,
            newCardInstanceId: transition.fact.newInstanceId,
          },
        });
      }
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
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: buildTrashToDeckArrangePrompt(
          nextState,
          selected,
          controller,
          topFrame.id,
          (cost as SimpleCost).position === "TOP" ? "TOP" : "BOTTOM"
        ),
      };
    }

    const appliedTrash = applyCostSelection(
      nextState,
      cost,
      selected,
      controller
    );
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
      return {
        state: nextState,
        events,
        resolved: false,
        pendingPrompt: buildTrashToDeckArrangePrompt(
          nextState,
          group,
          controller,
          topFrame.id,
          (cost as SimpleCost).position === "TOP" ? "TOP" : "BOTTOM"
        ),
      };
    }

    if (!topFrame.costReplacementChecked) {
      const replacement = checkReplacementForRemoval(
        nextState,
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
        return {
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: replacement.pendingPrompt,
        };
      }
      if (replacement.replaced)
        return abortReplacedCost(nextState, topFrame, events, cardDb, services);
    }

    const appliedGroup = applyCostSelection(nextState, cost, group, controller);
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
      const replacement = checkReplacementForRemoval(
        nextState,
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
        return {
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: replacement.pendingPrompt,
        };
      }
      if (replacement.replaced)
        return abortReplacedCost(nextState, topFrame, events, cardDb, services);
    }

    const appliedOrdered = applyCostSelection(
      nextState,
      cost,
      ordered,
      controller
    );
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
      controller
    );
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
      "RETURN_OWN_CHARACTER_TO_HAND",
      "PLACE_OWN_CHARACTER_TO_DECK",
      "ADD_OWN_CHARACTER_TO_LIFE",
    ]);
    if (fieldExitCosts.has(cost.type) && !topFrame.costReplacementChecked) {
      // Cost exits are still effect-caused removal events, but a replacement
      // means the printed payment did not occur (Rules 8-3-1-3-1/8-3-1-7).
      // Park the already-validated selection on the existing cost frame.
      let replacement =
        cost.type === "KO_OWN_CHARACTER"
          ? checkReplacementForKO(
              nextState,
              selected[0],
              "effect",
              controller,
              cardDb,
              services
            )
          : checkReplacementForRemoval(
              nextState,
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
          nextState,
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
        return {
          state: nextState,
          events,
          resolved: false,
          pendingPrompt: replacement.pendingPrompt,
        };
      }
      if (replacement.replaced) {
        return abortReplacedCost(nextState, topFrame, events, cardDb, services);
      }
    }
    const appliedSelected = applyCostSelection(
      nextState,
      cost,
      selected,
      controller
    );
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
          payload: { targetInstanceId: id, newState: "RESTED" },
        });
      }
    }

    // Track selected card IDs as cost result refs based on cost type
    if (
      cost.type === "TRASH_FROM_HAND" ||
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

    // Only trash payments publish CARD_TRASHED. Other selectable costs use
    // this same resume branch (including ST13-001's Character-to-Life cost),
    // so emitting it unconditionally fabricated a trash event for unrelated
    // zone transitions.
    if (
      cost.type === "TRASH_FROM_HAND" ||
      cost.type === "TRASH_OWN_CHARACTER"
    ) {
      events.push({
        type: "CARD_TRASHED",
        playerIndex: controller,
        payload: {
          count: selected.length,
          reason: "cost",
          from: cost.type === "TRASH_FROM_HAND" ? "HAND" : "CHARACTER",
        },
      });
    }
  } else {
    return { state, events, resolved: false };
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
      services
    );

    if (remainingCostResult.cannotPay) {
      return services.processRemainingTriggers(
        remainingCostResult.state,
        topFrame.pendingTriggers,
        cardDb
      );
    }

    nextState = remainingCostResult.state;
    events.push(...remainingCostResult.events);

    if (remainingCostResult.pendingPrompt) {
      // Persist accumulated cost refs and queued triggers into the new frame
      // (mirrors resumeAfterBranchPick — dropping pendingTriggers here would
      // lose triggers queued behind the cost chain).
      const newTop = peekFrame(nextState);
      if (newTop) {
        nextState = updateTopFrame(nextState, {
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
