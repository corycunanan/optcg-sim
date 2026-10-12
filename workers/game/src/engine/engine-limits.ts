import type {
  EngineLimitDiagnostic,
  GameState,
} from "../types.js";
import { isGameTerminated, terminateGame } from "./terminal.js";
import { ensureExecutionContext } from "./execution-context.js";

export const MAX_EFFECT_STACK_DEPTH = 100;
export const MAX_RESOLUTION_ACTIONS = 1_000;

/**
 * A bounded engine guard stopped resolution (effect stack depth or action
 * budget). Decision 5: this is an engine-limit outcome, distinct from the rule
 * 11-1-1-1 draw, so it is written as `engineOutcome.type: "ENGINE_LIMIT"`.
 */
export function terminateForEngineLimit(
  state: GameState,
  diagnostic: Extract<EngineLimitDiagnostic, { kind: "EFFECT_STACK_DEPTH" | "ACTION_BUDGET" }>,
): GameState {
  return terminateGame(state, { kind: "ENGINE_LIMIT", diagnostic });
}

export function terminateForEngineContract(
  state: GameState,
  diagnostic: Extract<EngineLimitDiagnostic, { kind: "ENGINE_CONTRACT" }>,
): GameState {
  return terminateGame(state, { kind: "ENGINE_CONTRACT", diagnostic });
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


