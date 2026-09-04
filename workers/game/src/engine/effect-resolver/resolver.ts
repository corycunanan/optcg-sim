/**
 * Core effect resolver — resolveEffect, executeActionChain, action dispatcher.
 */

import type {
  Action,
  ActionOf,
  CostResult,
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
import { postCostConditionsMet } from "./post-cost.js";
import {
  CONTINUATION_EFFECT_BLOCK,
  popFrame,
  pushFrame,
  generateFrameId,
  updateTopFrame,
} from "../effect-stack.js";
import { findCardInstance } from "../state.js";
import type {
  EffectResolverResult,
  ActionResult,
  ActionHandler,
  ActionHandlerMap,
  EffectResolverServices,
} from "./types.js";
import {
  markOncePerTurnUsed,
  extractEffectDescription,
  resolveAmount,
  sourceTextForBlock,
} from "./action-utils.js";
import { payCostsWithSelection, promptTypeToPhase } from "./cost-handler.js";
import {
  pushBatchResumeFrame,
  processRemainingTriggers,
  reenterBatchResume,
} from "./resume-core.js";
import { buildSelectTargetPrompt } from "./target-resolver.js";
import {
  SIMULTANEOUS_ACTION_TYPES,
  isSimultaneousGroupStart,
  planSimultaneousGroup,
  simultaneousGroupEnd,
  type SimultaneousGroupPlan,
} from "./simultaneous.js";

// Action handlers
import * as drawSearch from "./actions/draw-search.js";
import * as modifiers from "./actions/modifiers.js";
import * as removal from "./actions/removal.js";
import * as life from "./actions/life.js";
import * as don from "./actions/don.js";
import * as play from "./actions/play.js";
import * as handDeck from "./actions/hand-deck.js";
import * as effects from "./actions/effects.js";
import * as battleActions from "./actions/battle-actions.js";
import {
  executeChooseValue,
  executePlayerChoice,
  executeOpponentAction,
  executeReuseEffect,
} from "./actions/choice.js";
import { log } from "../../lib/log.js";
import {
  consumeResolutionAction,
  isEngineTerminated,
  terminateForEngineContract,
} from "../engine-limits.js";

import {
  ACTION_TYPES_WITHOUT_RESOLVER_HANDLER,
  ALL_ACTION_TYPES,
  TRIGGERING_CARD_REF,
  isOncePerTurnBlock,
  type ActionType,
} from "../effect-types.js";

// ─── Action dispatcher map ───────────────────────────────────────────────────

const ACTION_HANDLERS: Partial<ActionHandlerMap> = {
  // Draw / search
  DRAW: drawSearch.executeDraw,
  SEARCH_DECK: drawSearch.executeSearchDeck,
  SEARCH_TRASH_THE_REST: drawSearch.executeSearchTrashTheRest,
  MILL: drawSearch.executeMill,
  FULL_DECK_SEARCH: drawSearch.executeFullDeckSearch,
  DECK_SCRY: drawSearch.executeDeckScry,

  // Modifiers
  MODIFY_POWER: modifiers.executeModifyPower,
  MODIFY_COST: modifiers.executeModifyCost,
  GRANT_KEYWORD: modifiers.executeGrantKeyword,
  GRANT_ATTRIBUTE: modifiers.executeGrantAttribute,
  NEGATE_EFFECTS: modifiers.executeNegateEffects,
  SET_BASE_POWER: modifiers.executeSetBasePower,
  SET_POWER_TO_ZERO: modifiers.executeSetPowerToZero,
  COPY_POWER: modifiers.executeCopyPower,
  SWAP_BASE_POWER: modifiers.executeSwapBasePower,

  // Removal
  KO: removal.executeKO,
  RETURN_TO_HAND: removal.executeReturnToHand,
  RETURN_TO_DECK: removal.executeReturnToDeck,
  TRASH_CARD: removal.executeTrashCard,
  TRASH_FROM_HAND: removal.executeTrashFromHand,

  // Life
  ADD_TO_LIFE: life.executeAddToLife,
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
  REST_DON: don.executeRestDon,
  DISTRIBUTE_DON: don.executeDistributeDon,
  REDISTRIBUTE_DON: don.executeRedistributeDon,
  GIVE_OPPONENT_DON_TO_OPPONENT: don.executeGiveOpponentDonToOpponent,

  // Play / state
  PLAY_CARD: (
    state,
    action,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs,
    preselectedTargets
  ) =>
    play.executePlayCard(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
      preselectedTargets
    ),
  PLAY_SELF: play.executePlaySelf,
  SET_ACTIVE: play.executeSetActive,
  SET_REST: play.executeSetRest,
  ACTIVATE_EVENT_FROM_HAND: play.executeActivateEventFromHand,
  ACTIVATE_EVENT_FROM_TRASH: play.executeActivateEventFromTrash,

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
  SET_COST: effects.executeSetCost,
  WIN_GAME: effects.executeWinGame,
  NEGATE_TRIGGER_TYPE: effects.executeNegateTriggerType,
  EXTRA_TURN: effects.executeExtraTurn,

  // Battle
  REDIRECT_ATTACK: battleActions.executeRedirectAttack,
  DEAL_DAMAGE: battleActions.executeDealDamage,
  SELF_TAKE_DAMAGE: battleActions.executeSelfTakeDamage,

  // Choice
  PLAYER_CHOICE: executePlayerChoice,
  OPPONENT_CHOICE: executePlayerChoice, // same handler, chooser determined inside
  CHOOSE_VALUE: executeChooseValue,
  OPPONENT_ACTION: executeOpponentAction,
  REUSE_EFFECT: executeReuseEffect,
};

function getActionHandler<K extends ActionType>(
  action: ActionOf<K>
): ActionHandler<K> | undefined {
  // TypeScript cannot retain the correlation between a computed union key and
  // its mapped value. Keep that one assertion at the dispatcher boundary.
  return ACTION_HANDLERS[action.type] as ActionHandler<K> | undefined;
}

/** Runtime handler inventory consumed by the authored-action CI contract. */
export function listRegisteredActionTypes(): ActionType[] {
  return Object.keys(ACTION_HANDLERS).sort() as ActionType[];
}

// OPT-200: drift detection between the `ActionType` union and `ACTION_HANDLERS`.
// Members listed here resolve through a different path or are referenced by
// zero schemas:
//   - RETURN_ATTACHED_DON_TO_COST is shared with the Cost union and resolves
//     through cost-handler.ts.
//   - GRANT_COUNTER / REMOVE_PROHIBITION are declared in the
//     union but referenced by zero schemas. Schema validation rejects authored
//     uses until a real handler is registered.
//
// Adding a new ActionType without registering a handler or adding it here trips
// this assertion at worker boot rather than no-op'ing in production.
const KNOWN_UNHANDLED_ACTION_TYPES: ReadonlySet<ActionType> = new Set(
  ACTION_TYPES_WITHOUT_RESOLVER_HANDLER
);

const _missingActionHandlers = ALL_ACTION_TYPES.filter(
  (t) => !(t in ACTION_HANDLERS) && !KNOWN_UNHANDLED_ACTION_TYPES.has(t)
);
if (_missingActionHandlers.length > 0) {
  throw new Error(
    `[resolver] ActionType union has unhandled types: ${_missingActionHandlers.join(", ")}. ` +
      `Register a handler in ACTION_HANDLERS or add to KNOWN_UNHANDLED_ACTION_TYPES.`
  );
}

/** Construction-complete recursive services shared by every resolver frame. */
const completeResolverServices: EffectResolverServices = {
  executeActionChain: (
    state,
    actions,
    sourceCardInstanceId,
    controller,
    cardDb,
    initialResultRefs,
    effectDescription,
    priorActionSucceeded
  ) =>
    executeActionChain(
      state,
      actions,
      sourceCardInstanceId,
      controller,
      cardDb,
      initialResultRefs,
      effectDescription,
      priorActionSucceeded
    ),
  executeEffectAction: (
    state,
    action,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs,
    preselectedTargets
  ) =>
    executeEffectAction(
    state,
    action,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs,
      preselectedTargets
  ),
  resolveEffect: (
    state,
    block,
    sourceCardInstanceId,
    controller,
    cardDb,
    triggeringCardInstanceId
  ) =>
    resolveEffect(
      state,
      block,
      sourceCardInstanceId,
      controller,
      cardDb,
      triggeringCardInstanceId
    ),
  continueSimultaneousGroup: (
    state,
    plan,
    sourceCardInstanceId,
    controller,
    cardDb
  ) =>
    continueSimultaneousGroup(
      state,
      plan,
      sourceCardInstanceId,
      controller,
      cardDb
    ),
  processRemainingTriggers: (state, triggers, cardDb, events, triggerOrderingGroup) =>
    processRemainingTriggers(
      state,
      triggers,
      cardDb,
      completeResolverServices,
      events,
      triggerOrderingGroup
    ),
  reenterBatchResume: (state, cardDb, events) =>
    reenterBatchResume(state, cardDb, completeResolverServices, events),
};
export const resolverExecutionServices = Object.freeze(
  completeResolverServices
);

// ─── resolveEffect ───────────────────────────────────────────────────────────

export function resolveEffect(
  state: GameState,
  block: EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  triggeringCardInstanceId?: string | null
): EffectResolverResult {
  const events: PendingEvent[] = [];
  const logCtx = {
    blockId: block.id,
    category: block.category,
    sourceInstanceId: sourceCardInstanceId,
    controller,
  };

  // Guard: reject once-per-turn effects already used this turn
  if (isOncePerTurnBlock(block)) {
    const usedSet = state.turn.oncePerTurnUsed[block.id];
    if (usedSet?.includes(sourceCardInstanceId)) {
      log("effect.skipped", { ...logCtx, reason: "once_per_turn_used" });
      return { state, events, resolved: false };
    }
  }

  const condCtx: ConditionContext = {
    sourceCardInstanceId,
    controller,
    cardDb,
  };

  // Extract block-specific effect description for prompts
  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const fullText = sourceTextForBlock(sourceCardData, block);
  const blockDescription = extractEffectDescription(fullText, block);

  // Step 1: Evaluate block-level conditions
  if (block.conditions) {
    if (!evaluateCondition(state, block.conditions, condCtx)) {
      log("effect.skipped", { ...logCtx, reason: "conditions_not_met" });
      return { state, events, resolved: false };
    }
  }

  // Step 2: Check optional flag — prompt the player before paying costs
  if (block.flags?.optional) {
    const cards: CardInstance[] = sourceCard ? [sourceCard] : [];
    const frameId = generateFrameId(state);
    state = frameId.state;

    const frame: EffectStackFrame = {
      id: frameId.id,
      sourceCardInstanceId,
      controller,
      effectBlock: block,
      phase: "AWAITING_OPTIONAL_RESPONSE",
      pausedAction: null,
      remainingActions: block.actions ?? [],
      resultRefs: triggeringCardInstanceId
        ? [
            [
              TRIGGERING_CARD_REF,
              { targetInstanceIds: [triggeringCardInstanceId], count: 1 },
            ],
          ]
        : [],
      validTargets: [],
      costs: block.costs ?? [],
      currentCostIndex: 0,
      costsPaid: false,
      oncePerTurnMarked: false,
      costResultRefs: [],
      pendingTriggers: [],
      simultaneousTriggers: [],
      accumulatedEvents: [],
    };
    state = pushFrame(state, frame);
    if (isEngineTerminated(state)) {
      return { state, events, resolved: false };
    }

    const pendingPrompt: PendingPromptState = {
      options: {
        promptType: "OPTIONAL_EFFECT",
        effectDescription: blockDescription,
        cards,
      },
      respondingPlayer: controller,
      resumeContext: frame.id,
    };
    log("effect.prompt", { ...logCtx, phase: "optional_prompt" });
    return { state, events, resolved: false, pendingPrompt };
  }

  // Step 3: Pay costs (with player selection support)
  let costResult: CostResult | undefined;
  if (block.costs && block.costs.length > 0) {
    const costPayResult = payCostsWithSelection(
      state,
      block.costs,
      0,
      controller,
      cardDb,
      sourceCardInstanceId,
      block,
      resolverExecutionServices
    );

    if (costPayResult.cannotPay) {
      state = costPayResult.state;
      log("effect.skipped", { ...logCtx, reason: "cannot_pay_cost" });
      return { state, events, resolved: false };
    }

    state = costPayResult.state;
    events.push(...costPayResult.events);
    costResult = costPayResult.costResult;

    if (costPayResult.pendingPrompt) {
      log("effect.prompt", { ...logCtx, phase: "cost_selection" });
      return {
        state,
        events,
        resolved: false,
        pendingPrompt: costPayResult.pendingPrompt,
      };
    }
  }

  // Mark once-per-turn as used
  if (isOncePerTurnBlock(block)) {
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  }

  // Step 4: Execute action chain — gated by the post-colon "If" (OPT-437),
  // evaluated exactly once now that costs are fully paid.
  if (
    !postCostConditionsMet(
      state,
      block,
      sourceCardInstanceId,
      controller,
      cardDb
    )
  ) {
    log("effect.skipped", {
      ...logCtx,
      reason: "post_cost_conditions_not_met",
    });
    return { state, events, resolved: true };
  }
  if (block.actions && block.actions.length > 0) {
    let initialRefs = costResultToRefs(costResult);
    if (triggeringCardInstanceId) {
      initialRefs = initialRefs ?? new Map<string, EffectResult>();
      initialRefs.set(TRIGGERING_CARD_REF, {
        targetInstanceIds: [triggeringCardInstanceId],
        count: 1,
      });
    }
    const chainResult = executeActionChain(
      state,
      block.actions,
      sourceCardInstanceId,
      controller,
      cardDb,
      initialRefs,
      blockDescription,
      undefined
    );
    state = chainResult.state;
    events.push(...chainResult.events);

    if (chainResult.pendingPrompt) {
      log("effect.prompt", { ...logCtx, phase: "action_chain" });
      return {
        state,
        events,
        resolved: false,
        pendingPrompt: chainResult.pendingPrompt,
      };
    }
  }

  log("effect.resolved", { ...logCtx, eventCount: events.length });
  return { state, events, resolved: true };
}

// ─── Action Chain ─────────────────────────────────────────────────────────────

export interface ChainResult {
  state: GameState;
  events: PendingEvent[];
  pendingPrompt?: PendingPromptState;
}

type UpToResourceAction =
  | ActionOf<"ADD_DON_FROM_DECK">
  | ActionOf<"ADD_TO_LIFE_FROM_DECK">
  | ActionOf<"SET_DON_ACTIVE">;

function isUpToResourceAction(action: Action): action is UpToResourceAction {
  return (
    (action.type === "ADD_DON_FROM_DECK" ||
      action.type === "ADD_TO_LIFE_FROM_DECK" ||
      action.type === "SET_DON_ACTIVE") &&
    action.params?.up_to === true
  );
}

function availableUpToAmount(
  state: GameState,
  action: UpToResourceAction,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): number {
  const requested = Math.max(
    0,
    resolveAmount(action.params?.amount ?? 1, resultRefs, state, controller, cardDb),
  );
  const player = state.players[controller];
  const available = action.type === "ADD_DON_FROM_DECK"
    ? player.donDeck.length
    : action.type === "ADD_TO_LIFE_FROM_DECK"
      ? player.deck.length
      : player.donCostArea.filter((don) => don.state === "RESTED").length;
  return Math.min(requested, available);
}

function expandUpToResourceAction(
  state: GameState,
  action: UpToResourceAction,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
): [ActionOf<"CHOOSE_VALUE">, Action] {
  const resultRef = "__engine_up_to_amount";
  const max = availableUpToAmount(state, action, controller, cardDb, resultRefs);
  const chooseAction: ActionOf<"CHOOSE_VALUE"> = {
    type: "CHOOSE_VALUE",
    params: { domain: "NUMBER", constraints: { min: 0, max } },
    result_ref: resultRef,
    chain: action.chain,
  };
  const resumedAction = {
    ...action,
    chain: "IF_DO",
    params: {
      ...action.params,
      amount: { type: "CHOSEN_VALUE", ref: resultRef },
      up_to: false,
    },
  } as Action;
  return [chooseAction, resumedAction];
}

function promptForSimultaneousSelection(
  state: GameState,
  plan: SimultaneousGroupPlan,
  actionIndex: number,
  validTargetIds: string[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>
): ChainResult {
  const action = plan.actions[actionIndex];
  const resultRefs = new Map<string, EffectResult>(plan.resultRefs);
  const promptResult = buildSelectTargetPrompt(
    state,
    action,
    validTargetIds,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs
  );
  if (!promptResult.pendingPrompt) return { state, events: [] };

  const frameId = generateFrameId(state);
  const frame: EffectStackFrame = {
    id: frameId.id,
    sourceCardInstanceId,
    controller,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction: action,
    remainingActions: plan.followingActions,
    resultRefs: plan.resultRefs,
    validTargets: validTargetIds,
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    simultaneousGroup: plan,
  };
  const nextState = pushFrame(frameId.state, frame);
  if (isEngineTerminated(nextState)) return { state: nextState, events: [] };

  let prompt = { ...promptResult.pendingPrompt, resumeContext: frame.id };
  if (plan.effectDescription && prompt.options) {
    prompt = {
      ...prompt,
      options: {
        ...prompt.options,
        effectDescription: plan.effectDescription,
      } as typeof prompt.options,
    };
  }
  return { state: nextState, events: [], pendingPrompt: prompt };
}

/**
 * Continue an AND transaction. Planning reads one unchanged snapshot and may
 * pause repeatedly for choices; handlers run only after every target is
 * locked. Events are returned only after the whole group commits.
 */
export function continueSimultaneousGroup(
  state: GameState,
  plan: SimultaneousGroupPlan,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>
): ChainResult {
  const unsupportedAction = plan.actions.find(
    (action) => !SIMULTANEOUS_ACTION_TYPES.has(action.type)
  );
  if (unsupportedAction) {
    const terminated = terminateForEngineContract(state, {
      kind: "ENGINE_CONTRACT",
      contract: "ACTION_HANDLER",
      actionType: unsupportedAction.type,
      sourceCardInstanceId,
      message: `Action type '${unsupportedAction.type}' cannot commit inside an AND transaction`,
    });
    return { state: terminated, events: [] };
  }

  const dependentTail = plan.followingActions[0];
  if (dependentTail?.chain === "IF_DO") {
    const terminated = terminateForEngineContract(state, {
      kind: "ENGINE_CONTRACT",
      contract: "ACTION_HANDLER",
      actionType: dependentTail.type,
      sourceCardInstanceId,
      message:
        "IF_DO cannot follow an AND transaction until group-success semantics are defined",
    });
    return { state: terminated, events: [] };
  }

  const planning = planSimultaneousGroup(
    state,
    plan,
    sourceCardInstanceId,
    controller,
    cardDb
  );
  if (planning.selection) {
    return promptForSimultaneousSelection(
      state,
      planning.plan,
      planning.selection.actionIndex,
      planning.selection.validTargetIds,
      sourceCardInstanceId,
      controller,
      cardDb
    );
  }

  const resultRefs = new Map<string, EffectResult>(planning.plan.resultRefs);
  const events: PendingEvent[] = [];
  let nextState = state;

  for (let index = 0; index < planning.plan.actions.length; index++) {
    const action = planning.plan.actions[index];
    const lock = planning.plan.locks[index];
    if (!lock?.execute) continue;
    const result = executeEffectAction(
      nextState,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
      lock.targetInstanceIds
    );
    nextState = result.state;
    events.push(...result.events);
    if (isEngineTerminated(nextState)) return { state: nextState, events };
    if (result.pendingPrompt || result.pendingBatchTriggers) {
      nextState = terminateForEngineContract(nextState, {
        kind: "ENGINE_CONTRACT",
        contract: "ACTION_HANDLER",
        actionType: action.type,
        sourceCardInstanceId,
        message: `Action type '${action.type}' opened an unsupported continuation during an AND commit`,
      });
      return { state: nextState, events };
    }
    if (action.result_ref && result.result)
      resultRefs.set(action.result_ref, result.result);
  }

  if (planning.plan.followingActions.length === 0)
    return { state: nextState, events };
  const tail = executeActionChain(
    nextState,
    planning.plan.followingActions,
    sourceCardInstanceId,
    controller,
    cardDb,
    resultRefs,
    planning.plan.effectDescription
  );
  return {
    state: tail.state,
    events: [...events, ...tail.events],
    ...(tail.pendingPrompt ? { pendingPrompt: tail.pendingPrompt } : {}),
  };
}

export function executeActionChain(
  state: GameState,
  actions: Action[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  initialResultRefs?: Map<string, EffectResult>,
  effectDescription?: string,
  priorActionSucceeded?: boolean
): ChainResult {
  const events: PendingEvent[] = [];
  const resultRefs = initialResultRefs ?? new Map<string, EffectResult>();
  let lastActionSucceeded = priorActionSucceeded ?? true;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    // A simultaneous group can itself be the dependent side of IF_DO. When
    // the dependency failed, skip the complete group rather than allowing an
    // AND sibling to escape as a standalone action.
    if (
      action.chain === "IF_DO" &&
      (i > 0 || priorActionSucceeded !== undefined) &&
      !lastActionSucceeded
    ) {
      lastActionSucceeded = false;
      if (isSimultaneousGroupStart(actions, i))
        i = simultaneousGroupEnd(actions, i);
      continue;
    }

    if (isSimultaneousGroupStart(actions, i)) {
      const end = simultaneousGroupEnd(actions, i);
      const group = actions.slice(i, end + 1);
      const plan: SimultaneousGroupPlan = {
        actions: group,
        locks: [],
        nextActionIndex: 0,
        followingActions: actions.slice(end + 1),
        resultRefs: [...resultRefs.entries()],
        effectDescription,
      };
      const groupResult = continueSimultaneousGroup(
        state,
        plan,
        sourceCardInstanceId,
        controller,
        cardDb
      );
      return {
        state: groupResult.state,
        events: [...events, ...groupResult.events],
        ...(groupResult.pendingPrompt
          ? { pendingPrompt: groupResult.pendingPrompt }
          : {}),
      };
    }

    // Check inline conditions
    if (action.conditions) {
      const condCtx: ConditionContext = {
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs,
      };
      if (!evaluateCondition(state, action.conditions, condCtx)) {
        lastActionSucceeded = false;
        continue;
      }
    }

    if (isUpToResourceAction(action)) {
      const expanded = expandUpToResourceAction(
        state,
        action,
        controller,
        cardDb,
        resultRefs,
      );
      const continuation = executeActionChain(
        state,
        [...expanded, ...actions.slice(i + 1)],
        sourceCardInstanceId,
        controller,
        cardDb,
        resultRefs,
        effectDescription,
        lastActionSucceeded,
      );
      return {
        state: continuation.state,
        events: [...events, ...continuation.events],
        ...(continuation.pendingPrompt
          ? { pendingPrompt: continuation.pendingPrompt }
          : {}),
      };
    }

    // Resolve target_ref to preselected targets
    let preselected: string[] | undefined;
    if (action.target_ref && resultRefs.has(action.target_ref)) {
      const refResult = resultRefs.get(action.target_ref);
      if (refResult?.targetInstanceIds?.length) {
        preselected = refResult.targetInstanceIds;
      }
    }

    // Execute the action
    const stackDepthBeforeAction = state.effectStack.length;
    const result = executeEffectAction(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
      preselected
    );

    state = result.state;
    events.push(...result.events);
    lastActionSucceeded = result.succeeded;
    if (isEngineTerminated(state)) return { state, events };

    if (result.pendingPrompt) {
      // Pause — push a stack frame with the remaining actions and surface the prompt
      const nestedPromptFrame = result.state.effectStack.at(-1);
      if (
        (action.type === "PLAYER_CHOICE" ||
          action.type === "OPPONENT_CHOICE" ||
          action.type === "OPPONENT_ACTION") &&
        nestedPromptFrame &&
        result.state.effectStack.length > stackDepthBeforeAction
      ) {
        const remainingActions = actions.slice(i + 1);
        const nestedState = remainingActions.length > 0
          ? updateTopFrame(result.state, {
              remainingActions: [
                ...nestedPromptFrame.remainingActions,
                ...remainingActions,
              ],
              ...(action.type === "OPPONENT_ACTION"
                ? { remainingActionsController: controller }
                : {}),
            })
          : result.state;
        return {
          state: nestedState,
          events,
          pendingPrompt: result.pendingPrompt,
        };
      }
      if (nestedPromptFrame?.replacementBatchContinuation) {
        // A non-optional replacement substitute opened its own prompt and
        // already pushed that prompt's frame. Insert this action chain's
        // continuation immediately below it so the substitute can finish the
        // replacement batch before the original suffix resumes.
        const frameId = generateFrameId(popFrame(result.state));
        const continuationFrame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock: CONTINUATION_EFFECT_BLOCK,
          phase: "INTERRUPTED_BY_TRIGGERS",
          pausedAction: action,
          remainingActions: actions.slice(i + 1),
          resultRefs: [...resultRefs.entries()],
          validTargets: [],
          priorActionSucceeded: false,
          costs: [],
          currentCostIndex: 0,
          costsPaid: true,
          oncePerTurnMarked: true,
          costResultRefs: [],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        const continuationState = pushFrame(frameId.state, continuationFrame);
        if (isEngineTerminated(continuationState))
          return { state: continuationState, events };
        const restoredPromptState = pushFrame(
          continuationState,
          nestedPromptFrame
        );
        return isEngineTerminated(restoredPromptState)
          ? { state: restoredPromptState, events }
          : {
              state: restoredPromptState,
              events,
              pendingPrompt: result.pendingPrompt,
            };
      }

      const rawContext = result.pendingPrompt.resumeContext as {
        type?: unknown;
      } | null;
      const isReplacementPrompt =
        rawContext?.type === "REPLACEMENT" ||
        rawContext?.type === "REPLACEMENT_BATCH";
      if (isReplacementPrompt) {
        const frameId = generateFrameId(result.state);
        const continuationFrame: EffectStackFrame = {
          id: frameId.id,
          sourceCardInstanceId,
          controller,
          effectBlock: CONTINUATION_EFFECT_BLOCK,
          phase: "INTERRUPTED_BY_TRIGGERS",
          pausedAction: action,
          remainingActions: actions.slice(i + 1),
          resultRefs: [...resultRefs.entries()],
          validTargets: [],
          priorActionSucceeded: false,
          costs: [],
          currentCostIndex: 0,
          costsPaid: true,
          oncePerTurnMarked: true,
          costResultRefs: [],
          pendingTriggers: [],
          simultaneousTriggers: [],
          accumulatedEvents: events,
        };
        const continuationState = pushFrame(frameId.state, continuationFrame);
        return isEngineTerminated(continuationState)
          ? { state: continuationState, events }
          : {
              state: continuationState,
              events,
              pendingPrompt: result.pendingPrompt,
            };
      }

      const ctx = result.pendingPrompt
        .resumeContext as import("../../types.js").ResumeContext;
      const phaseForPrompt = promptTypeToPhase(
        result.pendingPrompt.options.promptType
      );
      // Use the resume context's controller — it may differ from the chain's
      // controller when an OPPONENT_ACTION flips who is acting (e.g. opponent
      // trashes from their own hand via Perona OP06-093).
      const resumeController = ctx.controller ?? controller;
      const frameId = generateFrameId(result.state);
      const frame: EffectStackFrame = {
        id: frameId.id,
        sourceCardInstanceId,
        controller: resumeController,
        remainingActionsController: controller,
        effectBlock: CONTINUATION_EFFECT_BLOCK,
        phase: phaseForPrompt,
        pausedAction: ctx.pausedAction,
        remainingActions: actions.slice(i + 1),
        resultRefs: [...resultRefs.entries()],
        validTargets: ctx.validTargets,
        returnToDeckArrangement: ctx.returnToDeckArrangement,
        costs: [],
        currentCostIndex: 0,
        costsPaid: true, // costs already paid before action chain
        oncePerTurnMarked: true,
        costResultRefs: [],
        pendingTriggers: [],
        simultaneousTriggers: [],
        accumulatedEvents: events,
        ruleTrashForPlay: ctx.ruleTrashForPlay,
        stateDistributionForPlay: ctx.stateDistributionForPlay,
      };
      const updatedState = pushFrame(frameId.state, frame);
      if (isEngineTerminated(updatedState))
        return { state: updatedState, events };
      const prompt = { ...result.pendingPrompt, resumeContext: frame.id };
      // Override with block-specific description so prompts show the triggered
      // effect text rather than the full card text
      if (effectDescription && prompt.options) {
        prompt.options = {
          ...prompt.options,
          effectDescription,
        } as typeof prompt.options;
      }
      return { state: updatedState, events, pendingPrompt: prompt };
    }

    // OPT-172: rule 6-2 — handler paused mid-batch because a frame's events
    // queued ON_PLAY (or sibling) triggers. Push an AWAITING_BATCH_RESUME
    // frame carrying the marker + remaining chain actions, then drain the
    // triggers; reenterBatchResume re-invokes the handler with the
    // remaining-batch state once the drain completes.
    if (result.pendingBatchTriggers) {
      const { triggers, marker } = result.pendingBatchTriggers;
      const stateWithFrame = pushBatchResumeFrame(
        result.state,
        sourceCardInstanceId,
        controller,
        CONTINUATION_EFFECT_BLOCK,
        marker,
        triggers,
        actions.slice(i + 1),
        resultRefs
      );
      if (isEngineTerminated(stateWithFrame))
        return { state: stateWithFrame, events };
      const drain = processRemainingTriggers(
        stateWithFrame,
        triggers,
        cardDb,
        resolverExecutionServices,
        events
      );
      return {
        state: drain.state,
        events: drain.events,
        pendingPrompt: drain.pendingPrompt,
      };
    }

    // Store result reference
    if (action.result_ref && result.result) {
      resultRefs.set(action.result_ref, result.result);
    }
  }

  return { state, events };
}

function costResultToRefs(
  costResult: CostResult | undefined
): Map<string, EffectResult> | undefined {
  if (!costResult) return undefined;
  const hasValues =
    costResult.donRestedCount > 0 ||
    costResult.cardsTrashedCount > 0 ||
    costResult.cardsReturnedCount > 0 ||
    costResult.cardsPlacedToDeckCount > 0 ||
    costResult.charactersKoCount > 0;
  if (!hasValues) return undefined;
  const refs = new Map<string, EffectResult>();
  refs.set("__cost_don_rested", {
    targetInstanceIds: [],
    count: costResult.donRestedCount,
  });
  refs.set("__cost_cards_trashed", {
    targetInstanceIds: costResult.cardsTrashedInstanceIds ?? [],
    count: costResult.cardsTrashedCount,
  });
  refs.set("__cost_cards_returned", {
    targetInstanceIds: costResult.cardsReturnedInstanceIds ?? [],
    count: costResult.cardsReturnedCount,
  });
  refs.set("__cost_cards_placed_to_deck", {
    targetInstanceIds: [],
    count: costResult.cardsPlacedToDeckCount,
  });
  refs.set("__cost_characters_ko", {
    targetInstanceIds: costResult.charactersKoInstanceIds ?? [],
    count: costResult.charactersKoCount,
  });
  return refs;
}

// ─── Single Action Dispatcher ─────────────────────────────────────────────────

export function executeEffectAction<K extends ActionType>(
  state: GameState,
  action: ActionOf<K>,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[]
): ActionResult {
  state = consumeResolutionAction(state, action.type, sourceCardInstanceId);
  if (isEngineTerminated(state)) {
    return { state, events: [], succeeded: false };
  }
  const handler = getActionHandler(action);
  if (handler) {
    return handler(
      state,
      action,
      sourceCardInstanceId,
      controller,
      cardDb,
      resultRefs,
      preselectedTargets,
      resolverExecutionServices
    );
  }
  // Boot validation makes this unreachable for authored schemas. Treat any
  // untrusted/runtime drift as a rules-visible terminal engine contract fault.
  log("action.unhandled", {
    actionType: action.type,
    sourceInstanceId: sourceCardInstanceId,
    controller,
  });
  state = terminateForEngineContract(state, {
    kind: "ENGINE_CONTRACT",
    contract: "ACTION_HANDLER",
    actionType: action.type,
    sourceCardInstanceId,
    message: `No resolver handler is registered for action type '${action.type}'`,
  });
  return { state, events: [], succeeded: false };
}
