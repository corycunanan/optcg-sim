/**
 * Core effect resolver — resolveEffect, executeActionChain, action dispatcher.
 */

import type {
  Action,
  EffectBlock,
  EffectResult,
} from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PendingEvent,
  PendingPromptState,
  EffectStackFrame,
} from "../../types.js";
import { evaluateCondition, type ConditionContext } from "../conditions.js";
import { pushFrame, generateFrameId } from "../effect-stack.js";
import { findCardInstance } from "../state.js";
import type { EffectResolverResult, ActionResult, ActionHandler } from "./types.js";
import { markOncePerTurnUsed, extractEffectDescription } from "./action-utils.js";
import { payCostsWithSelection, promptTypeToPhase } from "./cost-handler.js";

// Action handlers
import * as drawSearch from "./actions/draw-search.js";
import * as modifiers from "./actions/modifiers.js";
import * as removal from "./actions/removal.js";
import * as life from "./actions/life.js";
import * as don from "./actions/don.js";
import * as play from "./actions/play.js";
import * as handDeck from "./actions/hand-deck.js";
import * as effects from "./actions/effects.js";
import { executePlayerChoice, executeOpponentAction, executeReuseEffect, setChoiceDependencies } from "./actions/choice.js";

import type { ActionType } from "../effect-types.js";

// ─── Action dispatcher map ───────────────────────────────────────────────────

const ACTION_HANDLERS: Partial<Record<ActionType, ActionHandler>> = {
  // Draw / search
  DRAW: drawSearch.executeDraw,
  SEARCH_DECK: drawSearch.executeSearchDeck,
  MILL: drawSearch.executeMill,
  FULL_DECK_SEARCH: drawSearch.executeFullDeckSearch,
  DECK_SCRY: drawSearch.executeDeckScry,

  // Modifiers
  MODIFY_POWER: modifiers.executeModifyPower,
  MODIFY_COST: modifiers.executeModifyCost,
  GRANT_KEYWORD: modifiers.executeGrantKeyword,
  GRANT_ATTRIBUTE: modifiers.executeGrantAttribute,
  NEGATE_EFFECTS: modifiers.executeNegateEffects,

  // Removal
  KO: removal.executeKO,
  RETURN_TO_HAND: removal.executeReturnToHand,
  RETURN_TO_DECK: removal.executeReturnToDeck,
  TRASH_CARD: removal.executeTrashCard,
  TRASH_FROM_HAND: removal.executeTrashFromHand,

  // Life
  ADD_TO_LIFE_FROM_DECK: life.executeAddToLifeFromDeck,
  TRASH_FROM_LIFE: life.executeTrashFromLife,
  TURN_LIFE_FACE_UP: life.executeTurnLifeFaceUp,
  TURN_LIFE_FACE_DOWN: life.executeTurnLifeFaceDown,
  TURN_ALL_LIFE_FACE_DOWN: life.executeTurnAllLifeFaceDown,
  LIFE_TO_HAND: life.executeLifeToHand,
  ADD_TO_LIFE_FROM_HAND: life.executeAddToLifeFromHand,
  ADD_TO_LIFE_FROM_FIELD: life.executeAddToLifeFromField,
  PLAY_FROM_LIFE: life.executePlayFromLife,
  LIFE_CARD_TO_DECK: life.executeLifeCardToDeck,
  TRASH_FACE_UP_LIFE: life.executeTrashFaceUpLife,
  LIFE_SCRY: life.executeLifeScry,
  DRAIN_LIFE_TO_THRESHOLD: life.executeDrainLifeToThreshold,
  REORDER_ALL_LIFE: life.executeReorderAllLife,

  // DON
  GIVE_DON: don.executeGiveDon,
  ADD_DON_FROM_DECK: don.executeAddDonFromDeck,
  FORCE_OPPONENT_DON_RETURN: don.executeForceOpponentDonReturn,
  SET_DON_ACTIVE: don.executeSetDonActive,
  REST_OPPONENT_DON: don.executeRestOpponentDon,
  RETURN_DON_TO_DECK: don.executeReturnDonToDeck,

  // Play / state
  PLAY_CARD: play.executePlayCard,
  PLAY_SELF: play.executePlaySelf,
  SET_ACTIVE: play.executeSetActive,
  SET_REST: play.executeSetRest,

  // Hand / deck
  PLACE_HAND_TO_DECK: handDeck.executePlaceHandToDeck,
  RETURN_HAND_TO_DECK: handDeck.executeReturnHandToDeck,
  HAND_WHEEL: handDeck.executeHandWheel,
  SHUFFLE_DECK: handDeck.executeShuffleDeck,
  REVEAL: handDeck.executeReveal,
  REVEAL_HAND: handDeck.executeRevealHand,
  SEARCH_AND_PLAY: handDeck.executeSearchAndPlay,

  // Effects / scheduling
  APPLY_PROHIBITION: effects.executeApplyProhibition,
  SCHEDULE_ACTION: effects.executeScheduleAction,
  APPLY_ONE_TIME_MODIFIER: effects.executeApplyOneTimeModifier,

  // Choice
  PLAYER_CHOICE: executePlayerChoice,
  OPPONENT_CHOICE: executePlayerChoice, // same handler, chooser determined inside
  OPPONENT_ACTION: executeOpponentAction,
  REUSE_EFFECT: executeReuseEffect,
};

// Wire up circular dependencies for choice handlers
setChoiceDependencies({
  executeActionChain,
  executeEffectAction,
  resolveEffect,
});

// ─── resolveEffect ───────────────────────────────────────────────────────────

export function resolveEffect(
  state: GameState,
  block: EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
): EffectResolverResult {
  const events: PendingEvent[] = [];
  const condCtx: ConditionContext = {
    sourceCardInstanceId,
    controller,
    cardDb,
  };

  // Extract block-specific effect description for prompts
  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const fullText = sourceCardData?.triggerText ?? sourceCardData?.effectText ?? "";
  const blockDescription = extractEffectDescription(fullText, block);

  // Step 1: Evaluate block-level conditions
  if (block.conditions) {
    if (!evaluateCondition(state, block.conditions, condCtx)) {
      return { state, events, resolved: false };
    }
  }

  // Step 2: Check optional flag — prompt the player before paying costs
  if (block.flags?.optional) {
    const cards: CardInstance[] = sourceCard ? [sourceCard] : [];

    const frame: EffectStackFrame = {
      id: generateFrameId(),
      sourceCardInstanceId,
      controller,
      effectBlock: block,
      phase: "AWAITING_OPTIONAL_RESPONSE",
      pausedAction: null,
      remainingActions: block.actions ?? [],
      resultRefs: [],
      validTargets: [],
      costs: block.costs ?? [],
      currentCostIndex: 0,
      costsPaid: false,
      oncePerTurnMarked: false,
      pendingTriggers: [],
      simultaneousTriggers: [],
      accumulatedEvents: [],
    };
    state = pushFrame(state, frame);

    const pendingPrompt: PendingPromptState = {
      promptType: "OPTIONAL_EFFECT",
      options: { effectDescription: blockDescription, cards },
      respondingPlayer: controller,
      resumeContext: frame.id,
    };
    return { state, events, resolved: false, pendingPrompt };
  }

  // Step 3: Pay costs (with player selection support)
  if (block.costs && block.costs.length > 0) {
    const costPayResult = payCostsWithSelection(
      state, block.costs, 0, controller, cardDb, sourceCardInstanceId, block,
    );

    if (costPayResult.cannotPay) {
      state = markOncePerTurnUsed(costPayResult.state, block.id, sourceCardInstanceId);
      return { state, events, resolved: false };
    }

    state = costPayResult.state;
    events.push(...costPayResult.events);

    if (costPayResult.pendingPrompt) {
      return { state, events, resolved: false, pendingPrompt: costPayResult.pendingPrompt };
    }
  }

  // Mark once-per-turn as used
  if (block.flags?.once_per_turn) {
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  }

  // Step 4: Execute action chain
  if (block.actions && block.actions.length > 0) {
    const chainResult = executeActionChain(
      state,
      block.actions,
      sourceCardInstanceId,
      controller,
      cardDb,
      undefined,
      blockDescription,
    );
    state = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      return { state, events, resolved: false, pendingPrompt: chainResult.pendingPrompt };
    }
  }

  return { state, events, resolved: true };
}

// ─── Action Chain ─────────────────────────────────────────────────────────────

interface ChainResult {
  state: GameState;
  events: PendingEvent[];
  pendingPrompt?: PendingPromptState;
}

export function executeActionChain(
  state: GameState,
  actions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  initialResultRefs?: Map<string, EffectResult>,
  effectDescription?: string,
): ChainResult {
  const events: PendingEvent[] = [];
  const resultRefs = initialResultRefs ?? new Map<string, EffectResult>();
  let lastActionSucceeded = true;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // Check chain connector
    if (action.chain && i > 0) {
      if (action.chain === "IF_DO" && !lastActionSucceeded) {
        lastActionSucceeded = false;
        continue;
      }
      // THEN: always execute
      // AND: execute simultaneously (treated as THEN for now)
    }

    // Check inline conditions
    if (action.conditions) {
      const condCtx: ConditionContext = {
        sourceCardInstanceId,
        controller,
        cardDb,
      };
      if (!evaluateCondition(state, action.conditions, condCtx)) {
        lastActionSucceeded = false;
        continue;
      }
    }

    // Execute the action
    const result = executeEffectAction(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
    );

    state = result.state;
    events.push(...result.events);
    lastActionSucceeded = result.succeeded;

    if (result.pendingPrompt) {
      // Pause — push a stack frame with the remaining actions and surface the prompt
      const ctx = result.pendingPrompt.resumeContext as import("../../types.js").ResumeContext;
      const phaseForPrompt = promptTypeToPhase(result.pendingPrompt.promptType);
      const frame: EffectStackFrame = {
        id: generateFrameId(),
        sourceCardInstanceId,
        controller,
        effectBlock: {} as EffectBlock, // not needed for mid-chain resumes
        phase: phaseForPrompt,
        pausedAction: ctx.pausedAction,
        remainingActions: actions.slice(i + 1),
        resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
        validTargets: ctx.validTargets,
        costs: [],
        currentCostIndex: 0,
        costsPaid: true, // costs already paid before action chain
        oncePerTurnMarked: true,
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
      };
      const updatedState = pushFrame(result.state, frame);
      const prompt = { ...result.pendingPrompt, resumeContext: frame.id };
      // Override with block-specific description so prompts show the triggered
      // effect text rather than the full card text
      if (effectDescription && prompt.options) {
        prompt.options = { ...prompt.options, effectDescription };
      }
      return { state: updatedState, events, pendingPrompt: prompt };
    }

    // Store result reference
    if (action.result_ref && result.result) {
      resultRefs.set(action.result_ref, result.result);
    }
  }

  return { state, events };
}

// ─── Single Action Dispatcher ─────────────────────────────────────────────────

export function executeEffectAction(
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
): ActionResult {
  const handler = ACTION_HANDLERS[action.type];
  if (handler) {
    return handler(state, action, sourceCardInstanceId, controller, cardDb, resultRefs, preselectedTargets);
  }
  // Action type not yet implemented
  return { state, events: [], succeeded: true };
}
