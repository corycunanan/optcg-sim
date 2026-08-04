/** Iterative cost payment orchestration and suspension. */
import type { Cost, CostResult, EffectBlock } from "../../effect-types.js";
import type { CardData, EffectStackFrame, GameState, PendingEvent, PendingPromptState } from "../../../types.js";
import { generateFrameId, pushFrame } from "../../effect-stack.js";
import { isEngineTerminated } from "../../engine-limits.js";
import { checkReplacementForRemoval } from "../../replacements.js";
import type { CostSelectionResult } from "../types.js";
import { costResultToEntries } from "../types.js";
import type { EffectResolverServices } from "../services.js";
import { payCosts } from "./payment.js";
import { applyCostSelection } from "./resume.js";
import { costNeedsPlayerSelection, isCostPayable } from "./payability.js";
import { computeCostTargets, getCostCards, resolveAmount } from "./targets.js";
import {
  blockShufflesDeck,
  buildTrashToDeckArrangePrompt,
  deriveBranchLabel,
  getCostCtaLabel,
  getCostLabel,
} from "./prompts.js";

function getDonRestPayoffPerDon(effectBlock: EffectBlock): number | null {
  const payoffs = (effectBlock.actions ?? []).flatMap((action) => {
    if (action.type !== "MODIFY_POWER") return [];
    const amount = action.params?.amount;
    if (
      typeof amount !== "object" ||
      amount.type !== "PER_COUNT" ||
      amount.source !== "DON_RESTED_THIS_WAY"
    ) {
      return [];
    }
    const divisor = amount.divisor ?? 1;
    if (divisor <= 0 || amount.multiplier % divisor !== 0) return [];
    return [amount.multiplier / divisor];
  });
  return payoffs.length === 1 ? payoffs[0] : null;
}

/**
 * Pay costs iteratively. Auto-payable costs are paid inline.
 * Selection-based costs push a stack frame and return a prompt.
 */
export function payCostsWithSelection(
  state: GameState,
  costs: Cost[],
  startIndex: number,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  effectBlock: EffectBlock,
  services: EffectResolverServices,
): CostSelectionResult {
  const events: PendingEvent[] = [];
  let nextState = state;
  const costResult: CostResult = {
    donRestedCount: 0,
    cardsTrashedCount: 0,
    cardsReturnedCount: 0,
    cardsPlacedToDeckCount: 0,
    charactersKoCount: 0,
    cardsTrashedInstanceIds: [],
    cardsReturnedInstanceIds: [],
    charactersKoInstanceIds: [],
  };

  // Use a mutable copy so CHOOSE_ONE_COST auto-select can replace the slot.
  const workingCosts = [...costs];
  for (let i = startIndex; i < workingCosts.length; i++) {
    const cost = workingCosts[i];

    if (
      (cost.type === "REST_DON" || cost.type === "DON_REST") &&
      cost.amount === "ANY_NUMBER"
    ) {
      const activeDonCount = nextState.players[controller].donCostArea.filter(
        (don) => don.state === "ACTIVE",
      ).length;
      const payoffPerDon = getDonRestPayoffPerDon(effectBlock);
      const amounts = Array.from(
        { length: activeDonCount },
        (_, index) => index + 1,
      ).filter((amount) => {
        const hypotheticalPayment = payCosts(
          nextState,
          [{ ...cost, amount }],
          controller,
          cardDb,
          sourceCardInstanceId,
        );
        if (!hypotheticalPayment) return false;
        return workingCosts.slice(i + 1).every((remainingCost) =>
          isCostPayable(
            hypotheticalPayment.state,
            remainingCost,
            controller,
            cardDb,
            sourceCardInstanceId,
          ),
        );
      });
      if (amounts.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }
      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: amounts.map((amount) => `don-rest:${amount}`),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) {
        return { state: nextState, events, cannotPay: true };
      }

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Choose how many DON!! cards to rest",
          choices: amounts.map((amount) => ({
            id: `don-rest:${amount}`,
            label: payoffPerDon === null
              ? `Rest ${amount}`
              : `Rest ${amount} → ${payoffPerDon * amount >= 0 ? "+" : ""}${
                payoffPerDon * amount
              }`,
          })),
          confirmOrSkip: true,
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // CHOOSE_ONE_COST — present payable options to the player.
    if (cost.type === "CHOOSE_ONE_COST") {
      const options = cost.options ?? [];
      const payableIndices: number[] = [];
      for (let oi = 0; oi < options.length; oi++) {
        if (isCostPayable(nextState, options[oi], controller, cardDb, sourceCardInstanceId)) {
          payableIndices.push(oi);
        }
      }

      if (payableIndices.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }

      if (payableIndices.length === 1) {
        // Auto-select: replace slot and retry this index.
        workingCosts[i] = options[payableIndices[0]];
        i--;
        continue;
      }

      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: payableIndices.map((oi) => String(oi)),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Choose a cost to pay",
          choices: payableIndices.map((oi) => ({
            id: String(oi),
            label: getCostLabel(options[oi]),
          })),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // CHOICE — branching cost paths; each option is a full Cost[].
    if (cost.type === "CHOICE") {
      const payableBranchIndices: number[] = [];
      for (let bi = 0; bi < cost.options.length; bi++) {
        const branchPayable = cost.options[bi].every((c) =>
          isCostPayable(nextState, c, controller, cardDb, sourceCardInstanceId),
        );
        if (branchPayable) payableBranchIndices.push(bi);
      }

      if (payableBranchIndices.length === 0) {
        return { state: nextState, events, cannotPay: true };
      }

      if (payableBranchIndices.length === 1) {
        const branch = cost.options[payableBranchIndices[0]];
        workingCosts.splice(i, 1, ...branch);
        i--;
        continue;
      }

      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets: payableBranchIndices.map((bi) => String(bi)),
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "PLAYER_CHOICE",
          effectDescription: "Select how to pay the cost",
          choices: payableBranchIndices.map((bi) => ({
            id: String(bi),
            label: cost.labels?.[bi] ?? deriveBranchLabel(cost.options[bi]),
          })),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // OPT-371: PLACE_FROM_TRASH_TO_DECK — the player chooses WHICH trash
    // cards go back, and for multi-card costs also their ORDER ("in any
    // order"). Selection is skipped when the trash offers no choice, and
    // ordering is skipped when the block shuffles the deck afterward
    // (e.g. OP05-080) or for a single card.
    let autoPayTrashToDeck = false;
    if (cost.type === "PLACE_FROM_TRASH_TO_DECK") {
      const amount = resolveAmount(cost);
      const validTargets = computeCostTargets(nextState, cost, controller, cardDb, sourceCardInstanceId);
      if (validTargets.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      // OPT-372: TOP_OR_BOTTOM — the player picks the destination first;
      // the resume handler pins the choice on the cost and re-enters this
      // flow with a concrete position (mirrors CHOOSE_ONE_COST slot
      // replacement, LIFE_TO_HAND-style Top/Bottom choices).
      if (cost.position === "TOP_OR_BOTTOM") {
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: ["TOP", "BOTTOM"],
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return {
          state: nextState,
          events,
          pendingPrompt: {
            options: {
              promptType: "PLAYER_CHOICE",
              effectDescription: "Choose top or bottom of your deck for the placed cards",
              choices: [
                { id: "0", label: "Top" },
                { id: "1", label: "Bottom" },
              ],
            },
            respondingPlayer: controller,
            resumeContext: frame.id,
          },
        };
      }

      const needsSelection = validTargets.length > amount;
      const needsArrange = amount > 1 && !blockShufflesDeck(effectBlock);

      if (!needsSelection && needsArrange) {
        // Every candidate is forced — go straight to the arrange prompt.
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets,
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
          costArrangeStage: true,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return {
          state: nextState,
          events,
          pendingPrompt: buildTrashToDeckArrangePrompt(
            nextState, validTargets, controller, frame.id,
            cost.position === "TOP" ? "TOP" : "BOTTOM",
          ),
        };
      }
      // No choice and order is moot — pay automatically below.
      autoPayTrashToDeck = !needsSelection;
      // needsSelection → generic SELECT_TARGET prompt below; the arrange
      // step (if any) is chained by the resume handler after selection.
    }

    // OPT-431/OPT-430: PLACE_SELF_AND_TRASH_TO_DECK — "place this Character
    // and N [matching] from your trash at the bottom of your deck in any
    // order" (OP10-026/027). The self half is fixed to the source card; the
    // player selects WHICH trash cards, then orders the whole group (self +
    // trash) in a single arrange prompt per Comprehensive Rule 3-1-7.
    if (cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" || cost.type === "PLACE_SELF_AND_HAND_TO_DECK") {
      const amount = resolveAmount(cost);
      const player = nextState.players[controller];
      const sourceOnField = cost.type === "PLACE_SELF_AND_HAND_TO_DECK"
        ? player.stage?.instanceId === sourceCardInstanceId
        : player.characters.some((c) => c?.instanceId === sourceCardInstanceId);
      if (!sourceOnField) {
        return { state: nextState, events, cannotPay: true };
      }
      const trashCandidates = computeCostTargets(nextState, cost, controller, cardDb, sourceCardInstanceId);
      if (trashCandidates.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      const needsSelection = trashCandidates.length > amount;
      const needsArrange = !blockShufflesDeck(effectBlock);

      if (needsSelection) {
        // Stage 1: pick the trash cards. The arrange stage (self + picks)
        // is chained by the resume handler.
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: trashCandidates,
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        const pendingPrompt: PendingPromptState = {
          options: {
            promptType: "SELECT_TARGET",
            validTargets: trashCandidates,
            countMin: amount,
            countMax: amount,
            effectDescription: getCostLabel(cost),
            ctaLabel: getCostCtaLabel(cost),
            cards: getCostCards(nextState, cost, trashCandidates, controller),
          },
          respondingPlayer: controller,
          resumeContext: frame.id,
        };
        return { state: nextState, events, pendingPrompt };
      }

      const group = [sourceCardInstanceId, ...trashCandidates];
      if (needsArrange) {
        // Every trash candidate is forced — go straight to ordering the
        // full group (always 2+ cards: self + trash).
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: group,
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
          costArrangeStage: true,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return {
          state: nextState,
          events,
          pendingPrompt: buildTrashToDeckArrangePrompt(
            nextState, group, controller, frame.id,
            cost.position === "TOP" ? "TOP" : "BOTTOM",
          ),
        };
      }

      // Block shuffles afterward — order is moot, pay in default order.
      const applied = applyCostSelection(nextState, cost, group, controller);
      nextState = applied.state;
      events.push(...applied.events);
      costResult.cardsPlacedToDeckCount += group.length;
      continue;
    }

    if (!autoPayTrashToDeck && costNeedsPlayerSelection(cost)) {
      // Special handling for life costs with TOP_OR_BOTTOM — use PLAYER_CHOICE
      if ((cost.type === "LIFE_TO_HAND" || cost.type === "TRASH_FROM_LIFE") &&
          cost.position === "TOP_OR_BOTTOM") {
        const p = nextState.players[controller];
        if (p.life.length === 0) {
          return { state: nextState, events, cannotPay: true };
        }

        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock,
          phase: "AWAITING_COST_SELECTION",
          pausedAction: null,
          remainingActions: effectBlock.actions ?? [],
          resultRefs: [],
          validTargets: ["TOP", "BOTTOM"],
          costs: workingCosts,
          currentCostIndex: i,
          costsPaid: false,
          oncePerTurnMarked: false,
          costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

        const pendingPrompt: PendingPromptState = {
          options: {
            promptType: "PLAYER_CHOICE",
            effectDescription: cost.type === "TRASH_FROM_LIFE"
              ? "Choose top or bottom of your Life cards to trash"
              : "Choose top or bottom of your Life cards to add to your hand",
            choices: [
              { id: "0", label: "Top" },
              { id: "1", label: "Bottom" },
            ],
          },
          respondingPlayer: controller,
          resumeContext: frame.id,
        };
        return { state: nextState, events, pendingPrompt };
      }

      // Build valid targets for this cost
      const validTargets = computeCostTargets(nextState, cost, controller, cardDb, sourceCardInstanceId);
      const amount = typeof cost.amount === "number" ? cost.amount : 1;

      if (validTargets.length < amount) {
        return { state: nextState, events, cannotPay: true };
      }

      // Push stack frame for cost selection
      const frameId = generateFrameId(nextState);
      nextState = frameId.state;
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller,
        effectBlock,
        phase: "AWAITING_COST_SELECTION",
        pausedAction: null,
        remainingActions: effectBlock.actions ?? [],
        resultRefs: [],
        validTargets,
        costs: workingCosts,
        currentCostIndex: i,
        costsPaid: false,
        oncePerTurnMarked: false,
        costResultRefs: [...costResultToEntries(costResult)],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      nextState = pushFrame(nextState, frame);
      if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };

      const costLabel = getCostLabel(cost);
      const pendingPrompt: PendingPromptState = {
        options: {
          promptType: "SELECT_TARGET",
          validTargets,
          countMin: amount,
          countMax: amount,
          effectDescription: costLabel,
          ctaLabel: getCostCtaLabel(cost),
          cards: getCostCards(nextState, cost, validTargets, controller),
        },
        respondingPlayer: controller,
        resumeContext: frame.id,
      };
      return { state: nextState, events, pendingPrompt };
    }

    // Fixed-source field exits have no selection prompt, but replacement
    // effects may still suspend their payment (Rule 8-3-1-7). Park the same
    // cost frame used by selectable payments so decline can resume exactly.
    const fixedExitTarget = (() => {
      if (["TRASH_SELF", "PLACE_SELF_TO_DECK", "PLACE_SELF_AND_HAND_TO_DECK"].includes(cost.type)) {
        return sourceCardInstanceId;
      }
      if (["PLACE_STAGE_TO_DECK", "TRASH_OWN_STAGE"].includes(cost.type)) {
        return nextState.players[controller].stage?.instanceId;
      }
      return undefined;
    })();
    if (fixedExitTarget) {
      const replacement = checkReplacementForRemoval(
        nextState,
        fixedExitTarget,
        controller,
        cardDb,
        services,
      );
      nextState = replacement.state;
      events.push(...replacement.events);
      if (replacement.pendingPrompt) {
        const frameId = generateFrameId(nextState);
        nextState = frameId.state;
        const frame: EffectStackFrame = {
          id: frameId.id, sourceCardInstanceId, controller, effectBlock,
          phase: "AWAITING_COST_SELECTION", pausedAction: null,
          remainingActions: effectBlock.actions ?? [], resultRefs: [], validTargets: [],
          costs: workingCosts, currentCostIndex: i, costsPaid: false,
          oncePerTurnMarked: false, costResultRefs: [...costResultToEntries(costResult)],
          pendingTriggers: [], simultaneousTriggers: [], accumulatedEvents: events,
          costReplacementAction: { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" },
          costReplacementChecked: true,
        };
        nextState = pushFrame(nextState, frame);
        if (isEngineTerminated(nextState)) return { state: nextState, events, cannotPay: true };
        return { state: nextState, events, pendingPrompt: replacement.pendingPrompt };
      }
      if (replacement.replaced) {
        return { state: nextState, events, cannotPay: true };
      }
    }

    // Auto-payable cost — use existing payCosts for this single cost
    const singleResult = payCosts(nextState, [cost], controller, cardDb, sourceCardInstanceId);
    if (!singleResult) {
      return { state: nextState, events, cannotPay: true };
    }
    nextState = singleResult.state;
    events.push(...singleResult.events);
    costResult.donRestedCount += singleResult.costResult.donRestedCount;
    costResult.cardsTrashedCount += singleResult.costResult.cardsTrashedCount;
    costResult.cardsReturnedCount += singleResult.costResult.cardsReturnedCount;
    costResult.cardsPlacedToDeckCount += singleResult.costResult.cardsPlacedToDeckCount;
    costResult.charactersKoCount += singleResult.costResult.charactersKoCount;
    costResult.cardsTrashedInstanceIds.push(...singleResult.costResult.cardsTrashedInstanceIds);
    costResult.cardsReturnedInstanceIds.push(...singleResult.costResult.cardsReturnedInstanceIds);
    costResult.charactersKoInstanceIds.push(...singleResult.costResult.charactersKoInstanceIds);
  }

  return { state: nextState, events, costResult };
}
