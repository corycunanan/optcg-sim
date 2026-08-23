import type {
  CardData,
  EffectStackFrame,
  GameAction,
  GameState,
  PromptResumeContext,
  ResumeContext,
} from "../types.js";
import type { EffectResult } from "../engine/effect-types.js";
import {
  recalculateBattlePowers,
  resumeBattleDamageContinuation,
} from "../engine/battle.js";
import {
  resumeEffectChain,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { abortReplacedCost } from "../engine/effect-resolver/resume/cost.js";
import { continuePipelineFromExecution } from "../engine/pipeline.js";
import { resumePhaseBoundary } from "../engine/phases.js";
import { resumePregameFromPrompt } from "../engine/pregame.js";
import {
  continueReplacementBatchAfterSubstitute,
  resumeReplacement,
  resumeReplacementBatch,
  type BatchResumeResult,
  type ReplacementBatchResumeContext,
} from "../engine/replacements.js";
import { isDeclineResponse } from "./coordinator.js";

export interface PromptLifecycleServices {
  drainPregame(state: GameState): GameState;
  advanceStartOfTurn(state: GameState): GameState;
}

export interface PromptLifecycleResult {
  state: GameState;
  responseRejected: boolean;
  gameOver?: { winner: 0 | 1 | null; reason: string };
}

/**
 * Resume one durable prompt without storage, socket, or Cloudflare concerns.
 * The caller persists and publishes the returned state only after this
 * deterministic continuation has fully drained.
 */
export function resumePromptLifecycle(
  stateBeforeResume: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  services: PromptLifecycleServices
): PromptLifecycleResult {
  const prompt = stateBeforeResume.pendingPrompt;
  if (!prompt) {
    return { state: stateBeforeResume, responseRejected: true };
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
  let gameOver: PromptLifecycleResult["gameOver"];

  if (
    typeof resumeContext === "object" &&
    resumeContext !== null &&
    "type" in resumeContext &&
    resumeContext.type === "REPLACEMENT"
  ) {
    const replacement = resumeReplacement(
      state,
      resumeContext,
      !isDeclineResponse(action),
      cardDb,
      resolverExecutionServices
    );
    state = replacement.state;
    const costFrame = state.effectStack.at(-1);
    if (costFrame?.costReplacementAction) {
      if (replacement.replaced) {
        const aborted = abortReplacedCost(
          state,
          costFrame,
          replacement.events,
          cardDb,
          resolverExecutionServices
        );
        state = withPendingPrompt(aborted.state, aborted.pendingPrompt);
      } else {
        const resumed = resumeFromStack(
          state,
          { ...costFrame.costReplacementAction },
          cardDb
        );
        state = withPendingPrompt(resumed.state, resumed.pendingPrompt);
      }
    } else {
      state = recordReplacementContinuationResult(
        state,
        !replacement.replaced,
        []
      );
    }

    if (replacement.pendingPrompt) {
      state = { ...state, pendingPrompt: replacement.pendingPrompt };
    } else {
      const interrupted = resumeInterruptedEffectContinuations(
        state,
        action,
        cardDb
      );
      state = interrupted.state;
      gameOver = interrupted.gameOver;
    }
  } else if (
    typeof resumeContext === "object" &&
    resumeContext !== null &&
    "type" in resumeContext &&
    resumeContext.type === "REPLACEMENT_BATCH"
  ) {
    const context = resumeContext;
    const batch = resumeReplacementBatch(
      state,
      context,
      !isDeclineResponse(action),
      cardDb,
      resolverExecutionServices
    );
    state = batch.state;
    if (batch.pendingPrompt) {
      if (state.effectStack.length > stateBeforeResume.effectStack.length) {
        state = attachReplacementBatchContinuation(state, context);
      }
      state = { ...state, pendingPrompt: batch.pendingPrompt };
    } else {
      const finished = finishReplacementBatchResult(
        state,
        batch,
        context,
        cardDb
      );
      state = finished.state;
      gameOver = finished.gameOver;
      if (!state.pendingPrompt && !gameOver) {
        const interrupted = resumeInterruptedEffectContinuations(
          state,
          action,
          cardDb
        );
        state = interrupted.state;
        gameOver = interrupted.gameOver;
      }
    }
  } else if (state.effectStack.length > 0) {
    const resumedFrame = state.effectStack.at(-1)!;
    const resumed = resumeFromStack(state, action, cardDb);
    state = resumed.state;
    if (state.engineOutcome) {
      gameOver = terminalEngineOutcome(state);
    } else if (resumed.pendingPrompt) {
      if (resumedFrame.replacementBatchContinuation) {
        state = attachReplacementBatchContinuation(
          state,
          resumedFrame.replacementBatchContinuation
        );
      }
      state = { ...state, pendingPrompt: resumed.pendingPrompt };
      responseRejected = !!resumed.rejected;
    } else if (!resumed.resolved && resumed.events.length === 0) {
      state = stateBeforeResume;
      responseRejected = true;
    } else {
      if (resumed.events.length > 0) {
        const pipeline = continuePipelineFromExecution(
          state,
          { state, events: resumed.events },
          cardDb,
          respondingPlayer
        );
        state = pipeline.state;
        gameOver = pipeline.gameOver;
      }
      if (!state.pendingPrompt && !gameOver) {
        const completed = completeReplacementBatchContinuation(
          state,
          resumedFrame,
          cardDb
        );
        state = completed.state;
        gameOver = completed.gameOver;
      }
      if (!state.pendingPrompt && !gameOver) {
        const interrupted = resumeInterruptedEffectContinuations(
          state,
          action,
          cardDb
        );
        state = interrupted.state;
        gameOver = interrupted.gameOver;
      }
    }
  } else {
    if (!isResumeContext(resumeContext)) {
      return { state: stateBeforeResume, responseRejected: true };
    }
    const resumed = resumeEffectChain(state, resumeContext, action, cardDb);
    state = resumed.state;
    if (state.engineOutcome) {
      gameOver = terminalEngineOutcome(state);
    } else if (resumed.pendingPrompt) {
      state = { ...state, pendingPrompt: resumed.pendingPrompt };
    } else if (!resumed.resolved && resumed.events.length === 0) {
      state = stateBeforeResume;
      responseRejected = true;
    }
  }

  if (state.engineOutcome) {
    state = { ...state, pendingPrompt: null, effectStack: [] };
    gameOver = terminalEngineOutcome(state);
  }

  if (
    !state.pendingPrompt &&
    state.effectStack.length === 0 &&
    state.pregame?.phase === "START_OF_GAME_FX"
  ) {
    state = services.drainPregame(state);
  }

  while (
    !state.pendingPrompt &&
    state.effectStack.length === 0 &&
    state.turn.pendingBattleDamageContinuation
  ) {
    const continuation = resumeBattleDamageContinuation(state, cardDb);
    const pipeline = continuePipelineFromExecution(
      continuation.state,
      continuation,
      cardDb,
      respondingPlayer
    );
    state = pipeline.state;
    gameOver = pipeline.gameOver;
    if (gameOver) break;
  }

  if (state.status === "IN_PROGRESS") {
    state = recalculateBattlePowers(state, cardDb);
  }
  if (!state.pendingPrompt) {
    state = services.advanceStartOfTurn(state);
  }
  return { state, responseRejected, gameOver };
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

function terminalEngineOutcome(state: GameState) {
  return {
    winner: null,
    reason:
      state.winReason ?? "Unstoppable loop detected — game ends in a draw",
  } as const;
}

function recordReplacementContinuationResult(
  state: GameState,
  succeeded: boolean,
  finalizedIds: string[]
): GameState {
  let index = -1;
  for (let cursor = state.effectStack.length - 1; cursor >= 0; cursor -= 1) {
    if (state.effectStack[cursor].phase === "INTERRUPTED_BY_TRIGGERS") {
      index = cursor;
      break;
    }
  }
  if (index < 0) return state;

  const frame = state.effectStack[index];
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
  const updated: EffectStackFrame = {
    ...frame,
    priorActionSucceeded: frame.priorActionSucceeded === true || succeeded,
    resultRefs,
  };
  return {
    ...state,
    effectStack: [
      ...state.effectStack.slice(0, index),
      updated,
      ...state.effectStack.slice(index + 1),
    ],
  };
}

function attachReplacementBatchContinuation(
  state: GameState,
  context: ReplacementBatchResumeContext
): GameState {
  if (state.effectStack.length === 0) return state;
  const index = state.effectStack.length - 1;
  const frame = state.effectStack[index];
  return {
    ...state,
    effectStack: [
      ...state.effectStack.slice(0, index),
      { ...frame, replacementBatchContinuation: context },
    ],
  };
}

function completeReplacementBatchContinuation(
  state: GameState,
  frame: EffectStackFrame,
  cardDb: Map<string, CardData>
): { state: GameState; gameOver?: PromptLifecycleResult["gameOver"] } {
  const context = frame.replacementBatchContinuation;
  if (!context) return { state };
  const batch = continueReplacementBatchAfterSubstitute(
    state,
    context,
    cardDb,
    resolverExecutionServices
  );
  state = batch.state;
  if (batch.pendingPrompt) {
    return { state: { ...state, pendingPrompt: batch.pendingPrompt } };
  }
  return finishReplacementBatchResult(state, batch, context, cardDb);
}

function finishReplacementBatchResult(
  state: GameState,
  batch: BatchResumeResult,
  context: ReplacementBatchResumeContext,
  cardDb: Map<string, CardData>
): { state: GameState; gameOver?: PromptLifecycleResult["gameOver"] } {
  state = recordReplacementContinuationResult(
    state,
    batch.finalizedIds.length > 0,
    batch.finalizedIds
  );
  if (batch.events.length === 0) return { state };

  const outerContinuation =
    state.effectStack.at(-1)?.replacementBatchContinuation;
  const pipeline = continuePipelineFromExecution(
    state,
    { state, events: batch.events },
    cardDb,
    context.causingController
  );
  state = pipeline.state;
  if (pipeline.pendingPrompt && outerContinuation) {
    state = attachReplacementBatchContinuation(state, outerContinuation);
  }
  return { state, gameOver: pipeline.gameOver };
}

function resumeInterruptedEffectContinuations(
  initialState: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>
): { state: GameState; gameOver?: PromptLifecycleResult["gameOver"] } {
  let state = initialState;
  let gameOver: PromptLifecycleResult["gameOver"];
  while (
    !state.pendingPrompt &&
    !gameOver &&
    state.effectStack.at(-1)?.phase === "INTERRUPTED_BY_TRIGGERS"
  ) {
    const frame = state.effectStack.at(-1)!;
    if (frame.phaseBoundaryContinuation) {
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
          frame.phaseBoundaryContinuation.endingPlayerIndex
        );
        state = pipeline.state;
        gameOver = pipeline.gameOver;
      }
      continue;
    }
    const resumed = resumeFromStack(state, action, cardDb);
    state = resumed.state;
    if (resumed.pendingPrompt) {
      if (frame.replacementBatchContinuation) {
        state = attachReplacementBatchContinuation(
          state,
          frame.replacementBatchContinuation
        );
      }
      state = { ...state, pendingPrompt: resumed.pendingPrompt };
      break;
    }
    const completed = completeReplacementBatchContinuation(
      state,
      frame,
      cardDb
    );
    state = completed.state;
    gameOver = completed.gameOver;
  }
  return { state, gameOver };
}
