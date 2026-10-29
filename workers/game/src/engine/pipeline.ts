import { costRootMatches, publishCostOwnerRoots } from "./effect-resolver/cost/transaction.js";
import type { LifeTriggerStagingScope } from "./life-trigger-staging.js";
import { recalculateBattlePowers } from "./battle.js";
import { drainPendingWork } from "./pending-work-drain.js";
import { resolverExecutionServices } from "./effect-resolver/resolver.js";
import { createEffectExecutionScope } from "./trigger-executor.js";
import { continuationBoundary, prependFrame } from "./effect-stack.js";
/**
 * 7-Step Action Pipeline
 *
 * Player commands enter here; nested effects and replies use work-only
 * resolver/session boundaries and the same pending-work drain.
 *
 * 1. Validate
 * 2. Check Prohibitions  (M4: scans active prohibitions)
 * 3. Check Replacements  (generic entry remains a stub)
 * 4. Execute
 * 5. Report events/triggers, then drain ready work
 * 6. Recalculate Modifiers (M4: expire effects, recompute layers)
 * 7. Rule Processing     (defeat checks)
 */

import { isGameTerminated, publishBeforeGameOver } from "./terminal.js";
import type { CardData, GameAction, GameState, ExecuteResult, PendingPromptState, QueuedTrigger } from "../types.js";
import { validate } from "./validation.js";
import { execute } from "./execute.js";
import { emitPendingEvent } from "./events.js";
import { runRuleProcessing, runRuleProcessingAfterMove, type RuleProcessingContext } from "./defeat.js";
import { checkProhibitions } from "./prohibitions.js";
import { checkReplacements } from "./replacements.js";
import { findCardInstance } from "./state.js";
import {
  evaluateWhileConditions,
} from "./duration-tracker.js";
import { log } from "../lib/log.js";
import { beginEngineResolution } from "./engine-limits.js";
import { releaseMovedDonEffects } from "./don-area-effects.js";
import {
  fireEventsAndTriggers,
  recordAction,
  type ActedCardSnapshot,
} from "./trigger-queue.js";

export interface PipelineResult {
  state: GameState;
  valid: boolean;
  error?: string;
  gameOver?: { winner: 0 | 1 | null; reason: string };
  pendingPrompt?: PendingPromptState;
}

/**
 * Public game-action boundary: validates commands without requiring prior session
 * admission. In particular, PASS cannot advance battle while a decision waits.
 * Prompt replies (including OPTIONAL_EFFECT PASS declines) belong to the session
 * prompt lifecycle, not this boundary. Session identity, turn ownership, stale
 * reply IDs and undo policy remain the coordinator's responsibility.
 */
export function runPipeline(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): PipelineResult {
  if (state.effectStack.some(frame => frame.costExpectedRoot &&
    !costRootMatches(state, frame.costExpectedRoot)))
    return { state, valid: false, error: "Stale cost root" };
  const result = runPipelineAction(state, action, cardDb, actingPlayerIndex);
  if (!result.valid) return result;
  const priorIds = new Set(state.effectStack.map(frame => frame.id));
  const published = publishCostOwnerRoots(result.state, frame => !priorIds.has(frame.id));
  return published ? { ...result, state: published }
    : { state, valid: false, error: "Ambiguous cost history publication" };
}

function runPipelineAction(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): PipelineResult {
  if (state.status === "IN_PROGRESS" && !state.pendingPrompt && state.effectStack.length === 0) {
    state = beginEngineResolution(state);
  }
  const stateAtEntry = state;
  const logCtx = {
    gameId: state.id,
    turn: state.turn.number,
    actingPlayer: actingPlayerIndex,
    actionType: action.type,
  };
  log("pipeline.start", logCtx);

  // Step 1: Validate
  log("pipeline.step", { ...logCtx, step: "validate" });
  const validationError = validate(state, action, cardDb, actingPlayerIndex);
  if (validationError) {
    log("pipeline.end", { ...logCtx, outcome: "invalid", error: validationError });
    return { state, valid: false, error: validationError };
  }

  // Step 2: Check Prohibitions
  log("pipeline.step", { ...logCtx, step: "prohibitions" });
  const prohibitionVeto = checkProhibitions(state, action, cardDb, actingPlayerIndex);
  if (prohibitionVeto) {
    log("pipeline.end", { ...logCtx, outcome: "prohibited", error: prohibitionVeto });
    return { state, valid: false, error: prohibitionVeto };
  }

  // Step 3: Check Replacements
  log("pipeline.step", { ...logCtx, step: "replacements" });
  const replacementResult = checkReplacements(state, action, cardDb, actingPlayerIndex);
  let nextState = replacementResult.state;
  const actionToExecute = replacementResult.replaced && replacementResult.substituteAction
    ? replacementResult.substituteAction
    : action;

  // Emit replacement events
  for (const event of replacementResult.events) {
    nextState = emitPendingEvent(nextState, event, actingPlayerIndex);
  }

  // If the action was fully replaced (no substitute), skip execution
  if (replacementResult.replaced && !replacementResult.substituteAction) {
    log("pipeline.end", { ...logCtx, outcome: "fully_replaced" });
    return finishPipeline(nextState, actingPlayerIndex, cardDb);
  }

  // OPT-443: snapshot the acted card's printed properties BEFORE execution —
  // Events move to trash (with a new instanceId) during execute, so this is
  // the only reliable point to capture what card the action was about.
  // recordAction (end of step 5) attaches the snapshot so
  // ACTION_PERFORMED_THIS_TURN conditions can scope by controller, card
  // category, and base cost (OP15-002 "activated an Event with a base cost
  // of 3 or more").
  const actedCard = snapshotActedCard(nextState, actionToExecute, cardDb, actingPlayerIndex);

  // Step 4: Execute — produce new state snapshot
  log("pipeline.step", { ...logCtx, step: "execute" });
  if (actionToExecute.type === "ACTIVATE_EFFECT" ||
      actionToExecute.type === "PLAY_CARD" ||
      actionToExecute.type === "USE_COUNTER_EVENT") {
    nextState = createEffectExecutionScope(
      nextState, actionToExecute.cardInstanceId, actingPlayerIndex
    );
  }
  const stateBeforeExecute = nextState;
  let execResult = execute(nextState, actionToExecute, cardDb, actingPlayerIndex);
  if (
    actionToExecute.type === "PASS" &&
    execResult.state.turn.battleSubPhase === "DAMAGE_STEP"
  ) {
    const advanced = drainPendingWork(
      { ...execResult, resolved: true },
      cardDb,
      resolverExecutionServices
    );
    execResult = advanced;
  }
  // Rule 3-1-6-1: DON!! moved by a game action (attach, DON!! phase, …)
  // shed their effects. Effect actions and cost payments release per step.
  nextState = releaseMovedDonEffects(stateBeforeExecute, execResult.state);

  // Rule processing checkpoint after the executed move (9-1-2): a deck-out or
  // a lethal damage determination ends play before any trigger or prompt.
  nextState = runRuleProcessingAfterMove(stateAtEntry, nextState, executionRuleContext(execResult), cardDb, actingPlayerIndex);

  if (isGameTerminated(nextState)) {
    // Steps 5-7 do not run; the executed move's events still reach the log.
    nextState = publishBeforeGameOver(nextState, execResult.events, nextState.turn.activePlayerIndex);
    return finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
  }

  if (execResult.pendingPrompt) {
    const battleDebt = nextState.effectStack.find(
      (frame) =>
      frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
      frame.battleDamage.battleId === nextState.turn.battle?.battleId
    );
    if (battleDebt) nextState = createEffectExecutionScope(
      nextState, battleDebt.sourceCardInstanceId, battleDebt.controller
    );
    // Main/Counter execution owns its activation notification. Resolver frame
    // accumulators own their own prefixes and may scan them before the Event's
    // suffix finishes, so keep only the outer debt in a separate root barrier.
    if (execResult.events.some(
        (event) => event.type === "EVENT_ACTIVATED_FROM_HAND")) {
      const frameOwned = new Set(nextState.effectStack.flatMap((frame) => frame.accumulatedEvents));
      const activation = execResult.events.find(
        (event) => event.type === "EVENT_ACTIVATED_FROM_HAND"
      )!;
      const boundary = continuationBoundary(
        nextState,
        String(activation.payload?.cardInstanceId),
        activation.playerIndex ?? actingPlayerIndex
      );
      nextState = prependFrame(boundary.state, {
        ...boundary.frame,
        kind: "EVENT_ACTIVATION",
        eventActivation: {
          publication: "AFTER_STACK",
          sourceZone: "HAND",
          sourceClass: "EVENT",
          events: execResult.events.filter(
            (event) =>
              !frameOwned.has(event) &&
              (!event.propagation?.eventLogEmitted ||
                !event.propagation?.triggerScanned)
          ),
        },
      });
      if (isGameTerminated(nextState))
        return finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
      nextState = recordAction(nextState, actionToExecute, actedCard);
    }
    nextState = recalculateBattlePowers({ ...nextState, pendingPrompt: execResult.pendingPrompt }, cardDb);
    log("pipeline.end", {
      ...logCtx,
      outcome: "prompt_pending",
      stage: "execute",
      promptType: execResult.pendingPrompt.options.promptType,
    });
    return { state: nextState, valid: true, pendingPrompt: execResult.pendingPrompt };
  }

  // Preserve the public history contract of an End Phase action that parks
  // before execution completes. Moving its work to the drain must not make
  // ADVANCE_PHASE newly visible to ACTION_PERFORMED_THIS_TURN conditions.
  const phaseExecutionPending =
    actionToExecute.type === "ADVANCE_PHASE" &&
    nextState.effectStack.some((frame) => frame.phaseBoundaryContinuation);

  // Step 5: report events, then drain the work they make ready.
  log("pipeline.step", { ...logCtx, step: "triggers" });
  nextState = fireEventsAndTriggers(nextState, execResult, actionToExecute, cardDb, actedCard,
    false,
    execResult.queuedTriggers
  );
  const drained = drainPendingWork(
    { state: nextState, events: [], resolved: true },
    cardDb,
    resolverExecutionServices
  );
  nextState = drained.pendingPrompt
    ? { ...drained.state, pendingPrompt: drained.pendingPrompt }
    : drained.state;
  // Trigger work may change either combatant after the report boundary.
  nextState = recalculateBattlePowers(nextState, cardDb);
  if (
    !isGameTerminated(nextState) &&
    !(phaseExecutionPending && drained.pendingPrompt)
  )
    nextState = recordAction(nextState, actionToExecute, actedCard);

  if (isGameTerminated(nextState)) {
    return finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
  }

  // If triggers paused for player input, skip steps 6-7 and surface the prompt
  if (nextState.pendingPrompt) {
    const defeated = ruleProcessingBeforePrompt(stateAtEntry, nextState, actingPlayerIndex, cardDb, execResult);
    if (defeated) {
      log("pipeline.end", {
        ...logCtx,
        outcome: "game_over",
        winner: defeated.gameOver!.winner,
        reason: defeated.gameOver!.reason,
      });
      return defeated;
    }
    log("pipeline.end", {
      ...logCtx,
      outcome: "prompt_pending",
      stage: "triggers",
      promptType: nextState.pendingPrompt.options.promptType,
    });
    return { state: nextState, valid: true, pendingPrompt: nextState.pendingPrompt };
  }

  // Step 6: Recalculate Modifiers — expire effects whose duration ended
  log("pipeline.step", { ...logCtx, step: "recalculate_modifiers" });
  nextState = recalculateModifiers(nextState, actionToExecute, cardDb);

  // Step 7: Rule Processing — defeat conditions, zero-power KOs
  log("pipeline.step", { ...logCtx, step: "rule_processing" });
  const result = finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
  log("pipeline.end", {
    ...logCtx,
    outcome: result.gameOver ? "game_over" : "ok",
    ...(result.gameOver ? { winner: result.gameOver.winner, reason: result.gameOver.reason } : {}),
  });
  return result;
}

/**
 * Finish an execution result produced after an effect prompt resumes. This is
 * the Step 5-7 half of runPipeline: continuation events still fire auto effects,
 * recalculate modifiers, and perform lethal rule processing, but the prompt
 * response is not recorded as a second gameplay action.
 */
export function continuePipelineFromExecution(
  state: GameState,
  execResult: ExecuteResult,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
  deferredTriggers: readonly QueuedTrigger[] = execResult.queuedTriggers ?? [],
  lifeTriggerStaging: readonly LifeTriggerStagingScope[] = [],
): PipelineResult {
  const continuationAction: GameAction = { type: "REVEAL_TRIGGER", reveal: true };
  // Checkpoint for the resumed execution's lethal damage determination
  // (9-1-2). Its deck and Life moves were checked where they happened.
  const stateAtEntry = state;
  state = runRuleProcessingAfterMove(state, state, executionRuleContext(execResult), cardDb, actingPlayerIndex);
  if (isGameTerminated(state)) {
    state = publishBeforeGameOver(state, execResult.events, state.turn.activePlayerIndex);
    return finishPipeline(state, actingPlayerIndex, cardDb, execResult);
  }
  let nextState = fireEventsAndTriggers(
    state,
    execResult,
    continuationAction,
    cardDb,
    undefined,
    false,
    deferredTriggers,
  );
  const drained = drainPendingWork(
    { state: nextState, events: [], resolved: true, lifeTriggerStaging },
    cardDb,
    resolverExecutionServices
  );
  nextState = drained.pendingPrompt
    ? { ...drained.state, pendingPrompt: drained.pendingPrompt }
    : drained.state;
  // Trigger work may change either combatant after the report boundary.
  nextState = recalculateBattlePowers(nextState, cardDb);

  if (isGameTerminated(nextState)) {
    return finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
  }

  if (nextState.pendingPrompt) {
    const defeated = ruleProcessingBeforePrompt(stateAtEntry, nextState, actingPlayerIndex, cardDb, execResult);
    if (defeated) return defeated;
    return { state: nextState, valid: true, pendingPrompt: nextState.pendingPrompt };
  }

  nextState = recalculateModifiers(nextState, continuationAction, cardDb);
  return finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
}

/**
 * Resolve the card an action acts on, before execution moves it.
 * Returns undefined for action types whose performed-action entries
 * don't need card scoping.
 */
function snapshotActedCard(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): ActedCardSnapshot | undefined {
  let instanceId: string;
  if (action.type === "PLAY_CARD") {
    instanceId = action.cardInstanceId;
  } else if (action.type === "USE_COUNTER_EVENT") {
    instanceId = action.cardInstanceId;
  } else if (action.type === "DECLARE_BLOCKER") {
    instanceId = action.blockerInstanceId;
  } else {
    return undefined;
  }
  const card = findCardInstance(state, instanceId);
  const data = card && cardDb.get(card.cardId);
  if (!data) return undefined;
  return {
    controller: actingPlayerIndex,
    cardId: card.cardId,
    cardType: (data.type ?? "").toUpperCase(),
    baseCost: data.cost ?? 0,
  };
}

// ─── Step 6: Recalculate Modifiers ────────────────────────────────────────────

function recalculateModifiers(
  state: GameState,
  _action: GameAction,
  cardDb: Map<string, CardData>,
): GameState {
  // Re-evaluate WHILE_CONDITION effects every step
  state = evaluateWhileConditions(state, cardDb);

  // End-of-turn expiry (THIS_TURN effects, prohibitions, scheduled actions) is now
  // handled inside runEndPhase() before the turn transition, so it runs while
  // state.turn.number still matches the expiring effects' turn.

  return state;
}

// ─── Step 7: Rule Processing ──────────────────────────────────────────────────

/**
 * Checkpoint facts carried by one execution result (OPT-949): its lethal
 * damage determination. Used at every pipeline checkpoint.
 */
function executionRuleContext(execResult: ExecuteResult | undefined): RuleProcessingContext {
  return execResult?.lethalDamagePlayerIndex !== undefined
    ? { lethalDamage: [execResult.lethalDamagePlayerIndex] }
    : {};
}

/**
 * Action-end facts: the lethal damage determination. The end-of-turn window
 * (OP15-022 Brook's delayed loss) is no longer opened here: since OPT-924 the
 * End Phase opens it once, at the 6-6-1-4 boundary before the hand-off
 * (`phases.ts`), so it is evaluated inside the End Phase and never twice.
 */
function actionEndRuleContext(execResult: ExecuteResult | undefined): RuleProcessingContext {
  return executionRuleContext(execResult);
}

/**
 * Checkpoint before a prompt surfaces (OPT-949 acceptance 3; OPT-886 for the
 * damage case). Rule processing "is immediately resolved when the
 * corresponding event occurs, even if other actions are in the process of
 * being carried out" (9-1-2), so a defeat condition met by this action ends
 * the game and the prompt is discarded by the terminal writer. Returns null
 * when play continues.
 */
function ruleProcessingBeforePrompt(
  stateAtEntry: GameState,
  state: GameState,
  actingPlayerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
  execResult: ExecuteResult,
): PipelineResult | null {
  const checked = runRuleProcessingAfterMove(stateAtEntry, state, executionRuleContext(execResult), cardDb, actingPlayerIndex);
  if (!isGameTerminated(checked)) return null;
  return finishPipeline(checked, actingPlayerIndex, cardDb, execResult);
}

function finishPipeline(
  state: GameState,
  actingPlayerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
  execResult?: ExecuteResult,
): PipelineResult {
  // Action-end checkpoint: always runs, whatever changed.
  state = runRuleProcessing(state, actionEndRuleContext(execResult), cardDb, actingPlayerIndex);

  // Every terminal writer (rule processing, WIN_GAME, concession, engine
  // limit) has already written the final state; report it.
  if (state.status === "FINISHED" || state.status === "ABANDONED") {
    return {
      state,
      valid: true,
      gameOver: {
        winner: state.winner,
        reason: state.winReason ?? "Game over",
      },
    };
  }

  return { state, valid: true };
}
