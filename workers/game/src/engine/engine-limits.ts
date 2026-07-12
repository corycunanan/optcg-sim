import type {
  EngineLimitDiagnostic,
  GameState,
} from "../types.js";
import { emitEvent } from "./events.js";

export const MAX_EFFECT_STACK_DEPTH = 100;
export const MAX_RESOLUTION_ACTIONS = 1_000;

const INFINITE_LOOP_REASON = "Unstoppable loop detected — game ends in a draw";

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

export function consumeResolutionAction(
  state: GameState,
  actionType: string,
  sourceCardInstanceId: string,
): GameState {
  if (state.status !== "IN_PROGRESS") return state;
  const observed = (state.engineActionCount ?? 0) + 1;
  if (observed > MAX_RESOLUTION_ACTIONS) {
    return terminateForEngineLimit(state, {
      kind: "ACTION_BUDGET",
      limit: MAX_RESOLUTION_ACTIONS,
      observed,
      actionType,
      sourceCardInstanceId,
    });
  }
  return { ...state, engineActionCount: observed };
}

export function beginEngineResolution(state: GameState): GameState {
  return {
    ...state,
    engineActionCount: 0,
    engineOutcome: null,
  };
}

export function isEngineTerminated(state: GameState): boolean {
  return state.status === "FINISHED" && state.engineOutcome?.type === "INFINITE_LOOP_DRAW";
}
