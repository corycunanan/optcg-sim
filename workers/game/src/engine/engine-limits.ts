import type {
  EngineLimitDiagnostic,
  GameState,
} from "../types.js";
import { emitEvent } from "./events.js";
import { ensureExecutionContext } from "./execution-context.js";

export const MAX_EFFECT_STACK_DEPTH = 100;
export const MAX_RESOLUTION_ACTIONS = 1_000;

const INFINITE_LOOP_REASON = "Unstoppable loop detected — game ends in a draw";
const ENGINE_CONTRACT_REASON = "Engine contract failure — game ends in a draw";

export function terminateForEngineLimit(
  state: GameState,
  diagnostic: EngineLimitDiagnostic,
): GameState {
  if (state.engineOutcome?.type === "INFINITE_LOOP_DRAW") return state;

  const terminal: GameState = {
    ...state,
    status: "FINISHED",
    winner: null,
    winReason: INFINITE_LOOP_REASON,
    engineOutcome: { type: "INFINITE_LOOP_DRAW", diagnostic },
    pendingPrompt: null,
    effectStack: [],
    turn: {
      ...state.turn,
      battle: null,
      battleSubPhase: null,
      pendingTriggerFromEffect: undefined,
      pendingBattleDamageContinuation: undefined,
    },
  };

  return emitEvent(
    terminal,
    "GAME_OVER",
    state.turn.activePlayerIndex,
    { winner: null, reason: INFINITE_LOOP_REASON, diagnostic },
  );
}

export function terminateForEngineContract(
  state: GameState,
  diagnostic: Extract<EngineLimitDiagnostic, { kind: "ENGINE_CONTRACT" }>,
): GameState {
  if (state.engineOutcome) return state;

  const terminal: GameState = {
    ...state,
    status: "FINISHED",
    winner: null,
    winReason: ENGINE_CONTRACT_REASON,
    engineOutcome: { type: "ENGINE_ERROR_DRAW", diagnostic },
    pendingPrompt: null,
    effectStack: [],
    turn: {
      ...state.turn,
      battle: null,
      battleSubPhase: null,
      pendingTriggerFromEffect: undefined,
      pendingBattleDamageContinuation: undefined,
    },
  };

  return emitEvent(
    terminal,
    "GAME_OVER",
    state.turn.activePlayerIndex,
    { winner: null, reason: ENGINE_CONTRACT_REASON, diagnostic },
  );
}

export function consumeResolutionAction(
  state: GameState,
  actionType: string,
  sourceCardInstanceId: string,
): GameState {
  if (state.status !== "IN_PROGRESS") return state;
  const current = ensureExecutionContext(state);
  const observed = Math.max(
    current.executionContext.actionBudget.consumed,
    current.engineActionCount ?? 0,
  ) + 1;
  const limit = current.executionContext.actionBudget.limit;
  if (observed > limit) {
    return terminateForEngineLimit(current, {
      kind: "ACTION_BUDGET",
      limit,
      observed,
      actionType,
      sourceCardInstanceId,
    });
  }
  return {
    ...current,
    engineActionCount: observed,
    executionContext: {
      ...current.executionContext,
      actionBudget: { ...current.executionContext.actionBudget, consumed: observed },
    },
  };
}

export function beginEngineResolution(state: GameState): GameState {
  const current = ensureExecutionContext(state);
  return {
    ...current,
    engineActionCount: 0,
    engineOutcome: null,
    executionContext: {
      ...current.executionContext,
      actionBudget: { ...current.executionContext.actionBudget, consumed: 0 },
    },
  };
}

export function isEngineTerminated(state: GameState): boolean {
  return state.status === "FINISHED" && state.engineOutcome != null;
}
