/**
 * AWAITING_COST_SELECTION resume — handles the player's response to a cost
 * prompt (CHOOSE_ONE_COST branch pick, CHOICE branch pick, LIFE_TO_HAND
 * position, or generic SELECT_TARGET cost payment). Each branch either
 * re-enters payCostsWithSelection with the chosen/replaced cost, or applies
 * the target selection directly, then continues paying any remaining costs
 * and finally executes the effect's action chain.
 */

import type { Action, ChoiceCost, Cost, CostResult, EffectBlock, EffectResult } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  EffectStackFrame,
  QueuedTrigger,
} from "../../../types.js";
import { popFrame, peekFrame, updateTopFrame } from "../../effect-stack.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { markOncePerTurnUsed } from "../action-utils.js";
import { payCostsWithSelection, applyCostSelection } from "../cost-handler.js";
import { costResultToEntries, costResultRefsFromEntries } from "../types.js";
import { executeActionChain } from "../resolver.js";
import type { EffectResolverResult } from "../types.js";
import { processRemainingTriggers } from "./triggers.js";

/**
 * Merge a new set of cost result refs (from a payCostsWithSelection call)
 * into an accumulated refs map. Concatenates targetInstanceIds and sums
 * counts per key.
 */
function mergeCostRefs(
  accumulated: Map<string, EffectResult>,
  newResult: CostResult | undefined,
): Map<string, EffectResult> {
  if (!newResult) return accumulated;
  const newRefs = costResultRefsFromEntries(costResultToEntries(newResult));
  if (!newRefs) return accumulated;
  for (const [key, val] of newRefs) {
    const existing = accumulated.get(key);
    accumulated.set(key, existing
      ? { targetInstanceIds: [...existing.targetInstanceIds, ...val.targetInstanceIds], count: existing.count + val.count }
      : val);
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
): EffectResolverResult {
  const block = topFrame.effectBlock as EffectBlock;
  if (block.flags?.once_per_turn && !topFrame.oncePerTurnMarked) {
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  }

  const hasRefs = [...costRefs.values()].some((v) => v.count > 0);
  const costRefsForActions = hasRefs ? costRefs : undefined;

  if (topFrame.remainingActions.length > 0) {
    const chainResult = executeActionChain(
      state,
      topFrame.remainingActions as Action[],
      sourceCardInstanceId,
      controller,
      cardDb,
      costRefsForActions,
    );
    state = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      const newTop = peekFrame(state) as EffectStackFrame;
      if (newTop) {
        state = updateTopFrame(state, { pendingTriggers: topFrame.pendingTriggers });
      }
      return { state, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
    }

    // Scan chain events for new triggers (e.g., PLAY_CARD → ON_PLAY)
    if (chainResult.events.length > 0) {
      const chainScan = scanEventsForTriggers(state, chainResult.events, controller, cardDb);
      state = chainScan.state;
      if (chainScan.triggers.length > 0) {
        const allTriggers = [...chainScan.triggers, ...topFrame.pendingTriggers as QueuedTrigger[]];
        return processRemainingTriggers(state, allTriggers, cardDb, events);
      }
    }
  }

  return processRemainingTriggers(state, topFrame.pendingTriggers, cardDb, events);
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
): EffectResolverResult {
  const events: PendingEvent[] = [];
  let nextState = popFrame(state);

  const block = topFrame.effectBlock as EffectBlock;
  const resumeResult = payCostsWithSelection(
    nextState,
    replacedCosts,
    topFrame.currentCostIndex,
    controller,
    cardDb,
    sourceCardInstanceId,
    block,
  );

  if (resumeResult.cannotPay) {
    return processRemainingTriggers(resumeResult.state, topFrame.pendingTriggers, cardDb, events);
  }

  nextState = resumeResult.state;
  events.push(...resumeResult.events);

  if (resumeResult.pendingPrompt) {
    const newTop = peekFrame(nextState) as EffectStackFrame;
    if (newTop) {
      nextState = updateTopFrame(nextState, {
        costResultRefs: topFrame.costResultRefs,
        pendingTriggers: topFrame.pendingTriggers,
      });
    }
    return { state: nextState, events, resolved: false, pendingPrompt: resumeResult.pendingPrompt };
  }

  const mergedRefs = mergeCostRefs(new Map(accumulatedCostRefs), resumeResult.costResult);
  return finishCostsAndRunActions(
    nextState,
    events,
    topFrame,
    mergedRefs,
    controller,
    sourceCardInstanceId,
    cardDb,
  );
}

export function handleAwaitingCostSelection(
  state: GameState,
  action: GameAction,
  topFrame: EffectStackFrame,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const { sourceCardInstanceId, controller } = topFrame;
  const cost = topFrame.costs[topFrame.currentCostIndex] as Cost;

  // Reconstruct accumulated cost refs from the frame
  const accumulatedCostRefs = new Map<string, EffectResult>(
    (topFrame.costResultRefs ?? []) as [string, EffectResult][],
  );

  // CHOOSE_ONE_COST — player chose which option to pay; replace slot and re-enter.
  if (action.type === "PLAYER_CHOICE" && cost.type === "CHOOSE_ONE_COST") {
    const options = cost.options ?? [];
    const choiceIdx = Number(action.choiceId);
    const chosen = options[choiceIdx];
    if (!chosen) {
      return { state, events: [], resolved: false };
    }

    const replacedCosts = [...topFrame.costs] as Cost[];
    replacedCosts[topFrame.currentCostIndex] = chosen;

    return resumeAfterBranchPick(
      state,
      topFrame,
      replacedCosts,
      controller,
      sourceCardInstanceId,
      accumulatedCostRefs,
      cardDb,
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

    const replacedCosts = [...topFrame.costs] as Cost[];
    replacedCosts.splice(topFrame.currentCostIndex, 1, ...branch);

    return resumeAfterBranchPick(
      state,
      topFrame,
      replacedCosts,
      controller,
      sourceCardInstanceId,
      accumulatedCostRefs,
      cardDb,
    );
  }

  // ── LIFE_TO_HAND / generic SELECT_TARGET cost payment ────────────────────
  const events: PendingEvent[] = [];
  let nextState = state;

  // LIFE_TO_HAND with TOP_OR_BOTTOM — player chose a position
  if (action.type === "PLAYER_CHOICE" && cost.type === "LIFE_TO_HAND") {
    const position = action.choiceId === "1" ? "BOTTOM" : "TOP";
    const p = nextState.players[controller];
    if (p.life.length === 0) {
      nextState = popFrame(nextState);
      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
    }

    const removed = position === "TOP" ? p.life.slice(0, 1) : p.life.slice(-1);
    const newLife = position === "TOP" ? p.life.slice(1) : p.life.slice(0, -1);
    const handCards = removed.map((l) => ({
      instanceId: l.instanceId,
      cardId: l.cardId,
      zone: "HAND" as const,
      state: "ACTIVE" as const,
      attachedDon: [] as any[],
      turnPlayed: null,
      controller,
      owner: controller,
    }));

    const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
    newPlayers[controller] = { ...p, life: newLife, hand: [...p.hand, ...handCards] };
    nextState = { ...nextState, players: newPlayers };
    events.push({ type: "CARD_ADDED_TO_HAND_FROM_LIFE", playerIndex: controller, payload: { count: 1 } });
  } else if (action.type === "SELECT_TARGET") {
    const selected = action.selectedInstanceIds ?? [];
    nextState = applyCostSelection(nextState, cost, selected, controller);

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
    if (cost.type === "TRASH_FROM_HAND" || cost.type === "TRASH_SELF" || cost.type === "TRASH_OWN_CHARACTER") {
      const existing = accumulatedCostRefs.get("__cost_cards_trashed") ?? { targetInstanceIds: [], count: 0 };
      accumulatedCostRefs.set("__cost_cards_trashed", {
        targetInstanceIds: [...existing.targetInstanceIds, ...selected],
        count: existing.count + selected.length,
      });
    } else if (cost.type === "RETURN_OWN_CHARACTER_TO_HAND" || cost.type === "PLACE_OWN_CHARACTER_TO_DECK") {
      const existing = accumulatedCostRefs.get("__cost_cards_returned") ?? { targetInstanceIds: [], count: 0 };
      accumulatedCostRefs.set("__cost_cards_returned", {
        targetInstanceIds: [...existing.targetInstanceIds, ...selected],
        count: existing.count + selected.length,
      });
    } else if (cost.type === "KO_OWN_CHARACTER") {
      const existing = accumulatedCostRefs.get("__cost_characters_ko") ?? { targetInstanceIds: [], count: 0 };
      accumulatedCostRefs.set("__cost_characters_ko", {
        targetInstanceIds: [...existing.targetInstanceIds, ...selected],
        count: existing.count + selected.length,
      });
    }

    events.push({
      type: "CARD_TRASHED",
      playerIndex: controller,
      payload: { count: selected.length, reason: "cost" },
    });
  } else {
    return { state, events, resolved: false };
  }

  const block = topFrame.effectBlock as EffectBlock;
  const nextCostIndex = topFrame.currentCostIndex + 1;

  if (nextCostIndex < topFrame.costs.length) {
    const remainingCostResult = payCostsWithSelection(
      nextState, topFrame.costs as Cost[], nextCostIndex, controller, cardDb,
      sourceCardInstanceId, block,
    );

    if (remainingCostResult.cannotPay) {
      nextState = popFrame(remainingCostResult.state);
      return processRemainingTriggers(nextState, topFrame.pendingTriggers, cardDb);
    }

    nextState = remainingCostResult.state;
    events.push(...remainingCostResult.events);

    if (remainingCostResult.pendingPrompt) {
      // Persist accumulated cost refs into the new frame
      const newTop = peekFrame(nextState) as EffectStackFrame;
      if (newTop) {
        nextState = updateTopFrame(nextState, {
          costResultRefs: [...accumulatedCostRefs.entries()].map(([k, v]) => [k, v as any]),
        });
      }
      return { state: nextState, events, resolved: false, pendingPrompt: remainingCostResult.pendingPrompt };
    }

    // Merge remaining cost results into accumulated refs
    mergeCostRefs(accumulatedCostRefs, remainingCostResult.costResult);
  }

  nextState = popFrame(nextState);
  return finishCostsAndRunActions(
    nextState,
    events,
    topFrame,
    accumulatedCostRefs,
    controller,
    sourceCardInstanceId,
    cardDb,
  );
}
