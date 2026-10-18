import { takeInterruptedEvents } from "../engine/effect-resolver/resume/events.js";
import type {
  CardData,
  EffectStackFrame,
  GameAction,
  GameState,
  PendingEvent,
  PromptResumeContext,
  QueuedTrigger,
  ResumeContext,
} from "../types.js";
import type { EffectResult } from "../engine/effect-types.js";
import {
  continueBattleDamageFrame,
  recalculateBattlePowers,
  resumeBattleDamageFrame,
  type BattleDamageResult,
} from "../engine/battle.js";
import {
  continueEffectDamageFrame,
  resumeEffectDamageFrame,
  type EffectDamageResult,
} from "../engine/effect-damage.js";
import { surfaceDamageFramePrompt, updateFrameById } from "../engine/damage-frames.js";
import {
  resumeEffectChain,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { abortReplacedCost } from "../engine/effect-resolver/resume/cost.js";
import { continuePipelineFromExecution } from "../engine/pipeline.js";
import { popFrame } from "../engine/effect-stack.js";
import { resumePhaseBoundary } from "../engine/phases.js";
import { resumePregameFromPrompt } from "../engine/pregame.js";
import {
  batchContextOf,
  continueReplacementBatchAfterSubstitute,
  openReplacementBatchFrame,
  resumeReplacement,
  resumeReplacementBatch,
  type BatchResumeResult,
} from "../engine/replacements.js";
import { isDeclineResponse } from "./coordinator.js";
import { releaseMovedDonEffects } from "../engine/don-area-effects.js";
import { translateBlindHandSelection } from "../engine/effect-resolver/blind-hand-slots.js";
import { isGameTerminated, publishBeforeGameOver } from "../engine/terminal.js";
import { runRuleProcessingAfterMove } from "../engine/defeat.js";
import { frameKindOf } from "./game-state-schema.js";

export interface PromptLifecycleServices {
  drainPregame(state: GameState): GameState;
  advanceStartOfTurn(state: GameState): GameState;
}

export interface PromptLifecycleResult {
  state: GameState;
  /**
   * The reply did not resolve the prompt it answered. Either `state` is the
   * pre-resume state (the prompt is unchanged), or — when `reprompted` is set —
   * `state` carries a refreshed prompt for the same choice that must be
   * persisted and sent. Either way the session answers with `action:rejected`.
   */
  responseRejected: boolean;
  /**
   * OPT-861: set with `responseRejected` when the reply was declined at resume
   * time and the same choice was asked again with refreshed candidates (for
   * example a persisted selection that went stale). Any resume-time
   * revalidation that re-asks instead of restoring state reports this way.
   */
  reprompted?: boolean;
  gameOver?: { winner: 0 | 1 | null; reason: string };
}

type GameOver = PromptLifecycleResult["gameOver"];

/**
 * Resume one durable prompt without storage, socket, or Cloudflare concerns.
 * The caller persists and publishes the returned state only after this
 * deterministic continuation has fully drained.
 */
export function resumePromptLifecycle(
  stateBeforeResume: GameState,
  reply: GameAction,
  cardDb: Map<string, CardData>,
  services: PromptLifecycleServices
): PromptLifecycleResult {
  const result = resumePromptLifecycleUnreleased(
    stateBeforeResume,
    reply,
    cardDb,
    services
  );
  if (result.responseRejected) return result;
  // Rule 3-1-6-1 catch-all for prompt resumes (OPT-792): any DON!! a resume
  // handler moved — including handlers that call leave-field helpers such as
  // trashCharacter directly (rule-trash for play, replacement finalization,
  // battle-damage continuations) — sheds its id-keyed effects. Effect
  // actions, cost payments and the Refresh Phase already release per step.
  const released = releaseMovedDonEffects(stateBeforeResume, result.state);
  return released === result.state ? result : { ...result, state: released };
}

function resumePromptLifecycleUnreleased(
  stateBeforeResume: GameState,
  reply: GameAction,
  cardDb: Map<string, CardData>,
  services: PromptLifecycleServices
): PromptLifecycleResult {
  const prompt = stateBeforeResume.pendingPrompt;
  if (!prompt) {
    return { state: stateBeforeResume, responseRejected: true };
  }

  // Blind choices carry a chooser and hidden-face policy that generic target
  // reconstruction cannot recover from the effect controller. Reject malformed
  // replies before clearing the original prompt or consuming its continuation.
  let action = reply;
  if (
    prompt.options.promptType === "SELECT_TARGET" &&
    prompt.options.blindSelection
  ) {
    if (reply.type !== "SELECT_TARGET") {
      return { state: stateBeforeResume, responseRejected: true };
    }
    const selected = reply.selectedInstanceIds;
    const { countMin, countMax, validTargets } = prompt.options;
    if (
      selected.length < countMin ||
      selected.length > countMax ||
      new Set(selected).size !== selected.length ||
      selected.some((id) => !validTargets.includes(id))
    ) {
      return { state: stateBeforeResume, responseRejected: true };
    }
    // Hand-sourced blind prompts offer opaque slot tokens (OPT-838). Resume
    // with the instance ids they name; anything else is rejected intact.
    const translated = translateBlindHandSelection(prompt, selected);
    if (!translated) {
      return { state: stateBeforeResume, responseRejected: true };
    }
    action = { ...reply, selectedInstanceIds: translated };
  }

  const resumeContext = prompt.resumeContext;
  const respondingPlayer = prompt.respondingPlayer;
  if (
    typeof resumeContext === "object" &&
    resumeContext !== null &&
    "type" in resumeContext &&
    (resumeContext.type === "PREGAME_PRIORITY_CHOICE" ||
      resumeContext.type === "PREGAME_MULLIGAN")
  ) {
    return {
      state: services.drainPregame(
        resumePregameFromPrompt(stateBeforeResume, action, respondingPlayer)
      ),
      responseRejected: false,
    };
  }

  let state: GameState = { ...stateBeforeResume, pendingPrompt: null };
  let responseRejected = false;
  let reprompted = false;
  let gameOver: GameOver;

  // OPT-963: every durable prompt names the frame that owns it (§2.4); the
  // top frame's kind says how the reply is consumed.
  const top = state.effectStack.at(-1);
  const kind = top ? frameKindOf(top) : null;

  if (top && kind === "REPLACEMENT") {
    const answered = answerReplacementOffer(state, top, action, cardDb, respondingPlayer);
    state = answered.state;
    gameOver = answered.gameOver;
  } else if (top && kind === "REPLACEMENT_BATCH" && top.phase === "AWAITING_OPTIONAL_RESPONSE") {
    const answered = answerReplacementBatchOffer(state, top, action, cardDb);
    state = answered.state;
    gameOver = answered.gameOver;
  } else if (top && top.phase === "AWAITING_TRIGGER_REVEAL") {
    if (action.type !== "REVEAL_TRIGGER") {
      return { state: stateBeforeResume, responseRejected: true };
    }
    const revealed =
      kind === "BATTLE_DAMAGE"
        ? resumeBattleDamageFrame(state, action.reveal, cardDb)
        : resumeEffectDamageFrame(state, action.reveal, cardDb);
    const applied = applyDamageResult(state, revealed, cardDb, respondingPlayer);
    state = applied.state;
    gameOver = applied.gameOver;
  } else if (state.effectStack.length > 0) {
    const resumed = resumeFromStack(state, action, cardDb);
    state = resumed.state;
    if (isGameTerminated(state)) {
      state = publishBeforeGameOver(state, resumed.events, respondingPlayer);
      gameOver = terminalOutcome(state);
    } else if (resumed.pendingPrompt) {
      state = { ...state, pendingPrompt: resumed.pendingPrompt };
      reprompted = !!resumed.reprompted;
      responseRejected = !!resumed.rejected || reprompted;
    } else if (!resumed.resolved && resumed.events.length === 0) {
      state = stateBeforeResume;
      responseRejected = true;
    } else if (resumed.events.length > 0) {
      const pipeline = continuePipelineFromExecution(
        state,
        { state, events: resumed.events },
        cardDb,
        respondingPlayer
      );
      state = pipeline.state;
      gameOver = pipeline.gameOver;
    }
  } else {
    if (!isResumeContext(resumeContext)) {
      return { state: stateBeforeResume, responseRejected: true };
    }
    const resumed = resumeEffectChain(state, resumeContext, action, cardDb);
    state = resumed.state;
    if (isGameTerminated(state)) {
      state = publishBeforeGameOver(state, resumed.events, respondingPlayer);
      gameOver = terminalOutcome(state);
    } else if (resumed.rejected) {
      // The reply must not consume this prompt: keep it exactly as persisted.
      state = stateBeforeResume;
      responseRejected = true;
    } else if (resumed.pendingPrompt) {
      state = { ...state, pendingPrompt: resumed.pendingPrompt };
      reprompted = !!resumed.reprompted;
      responseRejected = reprompted;
    } else if (!resumed.resolved && resumed.events.length === 0) {
      state = stateBeforeResume;
      responseRejected = true;
    }
  }

  // Any terminal outcome written during the resume (rules defeat, WIN_GAME,
  // engine limit, …) is final: the terminal writer already cleared the prompt
  // and the stack, and no later branch may re-attach a continuation.
  if (isGameTerminated(state)) {
    state = { ...state, pendingPrompt: null, effectStack: [] };
    gameOver = terminalOutcome(state);
  } else if (!responseRejected) {
    // One unwind for every continuation that needs no input (OPT-963 §7):
    // parked End Phases, damage frames, replacement batches, interrupted chains.
    const unwound = resumeContinuations(state, action, cardDb, respondingPlayer, gameOver);
    state = unwound.state;
    gameOver = unwound.gameOver;
  }

  if (!isGameTerminated(state) && state.pendingPrompt) {
    // Checkpoint before the next prompt surfaces (OPT-949 acceptance 3).
    state = runRuleProcessingAfterMove(stateBeforeResume, state, {}, cardDb, respondingPlayer);
    if (isGameTerminated(state)) gameOver = terminalOutcome(state);
  }

  if (state.status !== "IN_PROGRESS" || gameOver) {
    state = { ...state, pendingEventActivationEvents: undefined };
  } else if (!responseRejected && !state.pendingPrompt && state.effectStack.length === 0 &&
      state.pendingEventActivationEvents?.length) {
    const events = state.pendingEventActivationEvents;
    // Clear before scanning: a watcher may itself prompt, persist, or end play.
    state = { ...state, pendingEventActivationEvents: undefined };
    const activation = continuePipelineFromExecution(state, { state, events }, cardDb, respondingPlayer);
    state = activation.state;
    gameOver = activation.gameOver;
    if (!gameOver) {
      const unwound = resumeContinuations(state, action, cardDb, respondingPlayer, gameOver);
      state = unwound.state;
      gameOver = unwound.gameOver;
    }
  }

  if (
    !state.pendingPrompt &&
    state.effectStack.length === 0 &&
    state.pregame?.phase === "START_OF_GAME_FX"
  ) {
    state = services.drainPregame(state);
  }

  if (state.status === "IN_PROGRESS") {
    state = recalculateBattlePowers(state, cardDb);
  }
  if (!state.pendingPrompt) {
    state = services.advanceStartOfTurn(state);
  }
  return {
    state,
    responseRejected,
    ...(reprompted ? { reprompted: true } : {}),
    gameOver,
  };
}

function isResumeContext(
  context: PromptResumeContext
): context is ResumeContext {
  return (
    typeof context === "object" &&
    context !== null &&
    "effectSourceInstanceId" in context &&
    "controller" in context &&
    "remainingActions" in context &&
    "resultRefs" in context &&
    "validTargets" in context
  );
}

function withPendingPrompt(
  state: GameState,
  pendingPrompt: GameState["pendingPrompt"] | undefined
): GameState {
  return pendingPrompt ? { ...state, pendingPrompt } : state;
}

/** The result every terminal writer recorded (winner may be a player or null). */
function terminalOutcome(state: GameState): { winner: 0 | 1 | null; reason: string } {
  return { winner: state.winner, reason: state.winReason ?? "Game over" };
}

/**
 * Feed a damage frame's result through the action pipeline: its events,
 * auto effects, the ordinary triggers the frame deferred (rule 8-6-2), and
 * the lethal checks receive the same processing as an ordinary action. A
 * prompt (the Trigger's effect, the next point's window, or an attacker
 * effect) is surfaced as is.
 */
function applyDamageResult(
  state: GameState,
  result: BattleDamageResult | EffectDamageResult,
  cardDb: Map<string, CardData>,
  actingPlayer: 0 | 1
): { state: GameState; gameOver?: GameOver } {
  state = result.state;
  if (isGameTerminated(state)) {
    return { state: publishBeforeGameOver(state, result.events, actingPlayer), gameOver: terminalOutcome(state) };
  }
  if (result.pendingPrompt) return { state: withPendingPrompt(state, result.pendingPrompt) };
  const deferred: QueuedTrigger[] = "queuedTriggers" in result ? (result.queuedTriggers ?? []) : [];
  if (result.events.length === 0 && deferred.length === 0 && result.lethalDamagePlayerIndex === undefined) {
    return { state };
  }
  const pipeline = continuePipelineFromExecution(state, result, cardDb, actingPlayer, deferred);
  return { state: pipeline.state, gameOver: pipeline.gameOver };
}

/**
 * Unwind every continuation on top of the stack that needs no input, until a
 * prompt surfaces, the stack bottom is reached, or the game ends (OPT-963 §7).
 */
function resumeContinuations(
  initialState: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayer: 0 | 1,
  initialGameOver: GameOver
): { state: GameState; gameOver?: GameOver } {
  let state = initialState;
  let gameOver = initialGameOver;
  // A finished game has no frames to unwind: terminateGame, the only terminal
  // writer, clears the effect stack (pinned by the terminal suites), so the
  // loop stops on the empty stack; it needs no status guard of its own.
  while (!state.pendingPrompt) {
    const frame = state.effectStack.at(-1);
    if (!frame) break;
    const kind = frameKindOf(frame);

    if (kind === "PHASE_BOUNDARY") {
      const resumed = resumePhaseBoundary(state, cardDb);
      state = resumed.state;
      if (resumed.pendingPrompt) {
        state = { ...state, pendingPrompt: resumed.pendingPrompt };
        break;
      }
      if (resumed.events.length > 0) {
        const pipeline = continuePipelineFromExecution(
          state,
          resumed,
          cardDb,
          frame.phaseBoundaryContinuation!.endingPlayerIndex
        );
        state = pipeline.state;
        gameOver = pipeline.gameOver;
      }
      continue;
    }

    if (kind === "BATTLE_DAMAGE" || kind === "EFFECT_DAMAGE") {
      if (frame.phase === "AWAITING_TRIGGER_REVEAL") {
        // The attacker's per-point effect has unwound: the defender's turn.
        state = surfaceDamageFramePrompt(state, cardDb);
        break;
      }
      const continued =
        kind === "BATTLE_DAMAGE"
          ? continueBattleDamageFrame(state, cardDb)
          : continueEffectDamageFrame(state, cardDb);
      const applied = applyDamageResult(state, continued, cardDb, actingPlayer);
      state = applied.state;
      gameOver = applied.gameOver;
      continue;
    }

    if (kind === "REPLACEMENT_BATCH") {
      if (frame.phase !== "INTERRUPTED_BY_TRIGGERS") break;
      // The accepted substitute finished: continue the batch from the frame.
      const context = batchContextOf(frame);
      const batch = continueReplacementBatchAfterSubstitute(
        popFrame(state),
        context,
        cardDb,
        resolverExecutionServices
      );
      const finished = finishReplacementBatch(batch.state, batch, context, cardDb);
      state = finished.state;
      gameOver = finished.gameOver;
      continue;
    }

    if (frame.phase === "INTERRUPTED_BY_TRIGGERS") {
      const resumed = resumeFromStack(state, action, cardDb);
      state = resumed.state;
      if (isGameTerminated(state)) {
        state = publishBeforeGameOver(state, resumed.events, actingPlayer);
        gameOver = terminalOutcome(state);
        break;
      }
      if (resumed.pendingPrompt) {
        state = { ...state, pendingPrompt: resumed.pendingPrompt };
        break;
      }
      if (resumed.events.length > 0) {
        const pipeline = continuePipelineFromExecution(
          state,
          { state, events: resumed.events },
          cardDb,
          actingPlayer
        );
        state = pipeline.state;
        gameOver = pipeline.gameOver;
      }
      continue;
    }

    break;
  }
  return { state, gameOver };
}

/**
 * Answer the REPLACEMENT frame on top: pop it, apply or decline the offer,
 * and hand the result to the caller directly below (OPT-963 §7): the
 * BATTLE_DAMAGE frame whose K.O. it replaces (OPT-872), the COST frame whose
 * exit it replaces, or the chain continuation that raised it. The result is
 * recorded exactly once; a substitute that prompts resolves above that caller.
 */
function answerReplacementOffer(
  initialState: GameState,
  offer: EffectStackFrame,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayer: 0 | 1
): { state: GameState; gameOver?: GameOver } {
  const { effectId, targetInstanceId, event } = offer.replacement!;
  let state = popFrame(initialState);
  const caller = state.effectStack.at(-1);
  const callerKind = caller ? frameKindOf(caller) : null;
  // OPT-872: only the unanswered continuation for this exact effect and
  // target is resumed (rules §7-1-4-1-2).
  const pausedBattle =
    caller &&
    callerKind === "BATTLE_DAMAGE" &&
    caller.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
    caller.battleDamage.resolution === undefined &&
    caller.battleDamage.replacementEffectId === effectId &&
    caller.battleDamage.targetInstanceId === targetInstanceId
      ? caller
      : null;

  const replacement = resumeReplacement(
    state,
    { type: "REPLACEMENT", effectId, targetInstanceId, event },
    !isDeclineResponse(action),
    cardDb,
    resolverExecutionServices
  );
  state = replacement.state;
  let gameOver: GameOver;

  if (pausedBattle) {
    state = updateFrameById(state, pausedBattle.id, (frame) => ({
      ...frame,
      battleDamage: {
        ...(frame.battleDamage as Extract<NonNullable<EffectStackFrame["battleDamage"]>, { stage: "CHARACTER_KO_REPLACEMENT" }>),
        resolution: replacement.replaced ? "REPLACED" : "NOT_REPLACED",
      },
    }));
    if (replacement.pendingPrompt) {
      // A substitute awaiting input (e.g. EB03-001's hand trash) keeps the
      // battle frame below it; the unwind ends the battle once it resolves.
      return { state: withPendingPrompt(state, replacement.pendingPrompt) };
    }
    // A substitute that resolved without a prompt: publish its events in the
    // same batch as the rest of the Damage Step, as the synchronous path does.
    const continued = continueBattleDamageFrame(state, cardDb, replacement.events);
    return applyDamageResult(state, continued, cardDb, actingPlayer);
  }

  // A cost-exit replacement (OPT-864): the COST frame that parked its
  // validated selection is the top frame unless the substitute pushed its
  // own prompt frames above it, in which case the substitute's prompt is
  // answered first and the cost frame stays parked beneath it.
  const topAfter = state.effectStack.at(-1);
  if (topAfter?.costReplacementAction && frameKindOf(topAfter) === "COST") {
    if (replacement.replaced) {
      const aborted = abortReplacedCost(state, topAfter, replacement.events, cardDb, resolverExecutionServices);
      state = withPendingPrompt(aborted.state, aborted.pendingPrompt);
    } else {
      const resumed = resumeFromStack(state, { ...topAfter.costReplacementAction }, cardDb);
      state = withPendingPrompt(resumed.state, resumed.pendingPrompt);
    }
  } else if (caller && callerKind === "TRIGGER_DRAIN") {
    state = recordReplacementContinuationResult(state, caller.id, !replacement.replaced, []);
  }
  if (replacement.pendingPrompt) {
    return { state: { ...state, pendingPrompt: replacement.pendingPrompt }, gameOver };
  }
  if (state.pendingPrompt) return { state, gameOver };
  if (replacement.events.length > 0) {
    const pipeline = continuePipelineFromExecution(
      state,
      { state, events: replacement.events },
      cardDb,
      actingPlayer
    );
    state = pipeline.state;
    gameOver = pipeline.gameOver;
  }
  return { state, gameOver };
}

/** Answer the REPLACEMENT_BATCH offer on top: pop the frame and step the batch from it. */
function answerReplacementBatchOffer(
  initialState: GameState,
  offer: EffectStackFrame,
  action: GameAction,
  cardDb: Map<string, CardData>
): { state: GameState; gameOver?: GameOver } {
  const context = batchContextOf(offer);
  const depth = initialState.effectStack.length - 1;
  let state = popFrame(initialState);
  const batch = resumeReplacementBatch(
    state,
    context,
    !isDeclineResponse(action),
    cardDb,
    resolverExecutionServices
  );
  state = batch.state;
  if (batch.pendingPrompt) {
    if (batch.continuationContext) {
      // An accepted substitute prompted: the batch waits below its frames.
      state = openReplacementBatchFrame(
        state,
        batch.continuationContext,
        "INTERRUPTED_BY_TRIGGERS",
        context.causingController,
        depth
      ).state;
    }
    return { state: withPendingPrompt(state, batch.pendingPrompt) };
  }
  return finishReplacementBatch(state, batch, context, cardDb);
}

/**
 * Record a replacement's outcome on the chain continuation that raised it:
 * `priorActionSucceeded` and the paused action's `result_ref` grow by the
 * ids finalized by the original consequence.
 */
function recordReplacementContinuationResult(
  state: GameState,
  frameId: string,
  succeeded: boolean,
  finalizedIds: string[]
): GameState {
  return updateFrameById(state, frameId, (frame) => {
    const resultRefs = [...frame.resultRefs];
    const resultRef = frame.pausedAction?.result_ref;
    if (resultRef) {
      const existing = resultRefs.findIndex(([key]) => key === resultRef);
      const previousResult = existing >= 0 ? resultRefs[existing][1] : undefined;
      const nextResult: [string, EffectResult] = [
        resultRef,
        {
          targetInstanceIds: [
            ...(previousResult?.targetInstanceIds ?? []),
            ...finalizedIds,
          ],
          count: (previousResult?.count ?? 0) + finalizedIds.length,
        },
      ];
      if (existing >= 0) resultRefs[existing] = nextResult;
      else resultRefs.push(nextResult);
    }
    return {
      ...frame,
      priorActionSucceeded: frame.priorActionSucceeded === true || succeeded,
      resultRefs,
    };
  });
}

/**
 * A batch that offered or finalized everything: record its result on the
 * chain continuation now on top, publish the committed prefix with the
 * batch's events, and continue through the pipeline. An outer batch below
 * (nested substitutes) is left for the unwind.
 */
function finishReplacementBatch(
  state: GameState,
  batch: BatchResumeResult,
  context: ReturnType<typeof batchContextOf>,
  cardDb: Map<string, CardData>
): { state: GameState; gameOver?: GameOver } {
  const caller = state.effectStack.at(-1);
  if (caller && frameKindOf(caller) === "TRIGGER_DRAIN") {
    state = recordReplacementContinuationResult(
      state,
      caller.id,
      batch.finalizedIds.length > 0,
      batch.finalizedIds
    );
  }
  const prefix = takeInterruptedEvents(state);
  state = prefix.state;
  const events: PendingEvent[] = [...prefix.events, ...batch.events];
  if (events.length === 0) return { state };
  const pipeline = continuePipelineFromExecution(
    state,
    { state, events },
    cardDb,
    context.causingController
  );
  return { state: pipeline.state, gameOver: pipeline.gameOver };
}
