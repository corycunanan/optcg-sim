/**
 * 7-Step Action Pipeline
 *
 * Every game mutation flows through here — no exceptions.
 * Steps 2 (prohibitions) and 3 (replacements) are no-ops in M3.
 * M4 fills them in without restructuring.
 *
 * 1. Validate
 * 2. Check Prohibitions  (M3: no-op)
 * 3. Check Replacements  (M3: no-op)
 * 4. Execute
 * 5. Fire Triggers       (M3: keyword handlers only)
 * 6. Recalculate Modifiers
 * 7. Rule Processing     (defeat checks)
 */

import type { CardData, GameAction, GameState } from "../types.js";
import { validate } from "./validation.js";
import { execute, ExecuteResult } from "./execute.js";
import { emitEvent } from "./events.js";
import { checkDefeat } from "./defeat.js";

export interface PipelineResult {
  state: GameState;
  valid: boolean;
  error?: string;
  gameOver?: { winner: 0 | 1 | null; reason: string };
}

export function runPipeline(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): PipelineResult {
  // Step 1: Validate
  const validationError = validate(state, action, cardDb);
  if (validationError) {
    return { state, valid: false, error: validationError };
  }

  // Step 2: Check Prohibitions (M3: no-op)
  // In M4: scan state.prohibitions for any veto matching this action.

  // Step 3: Check Replacements (M3: no-op)
  // In M4: scan active replacement effects; substitute action if matched.

  // Step 4: Execute — produce new state snapshot
  const execResult = execute(state, action, cardDb, actingPlayerIndex);
  let nextState = execResult.state;

  // Step 5: Fire Triggers — emit events, scan triggerRegistry
  // In M3: emit the appropriate event(s) for what just happened.
  nextState = fireEvents(nextState, execResult, action);

  // Step 6: Recalculate Modifiers
  // In M3: no persistent modifiers to recalculate (DON!! bonuses are computed
  // fresh on every read via getEffectivePower). No-op here until M4.

  // Step 7: Rule Processing — defeat conditions, zero-power KOs
  const defeatCtx = execResult.damagedPlayerIndex !== undefined
    ? { damagedPlayerIndex: execResult.damagedPlayerIndex }
    : {};
  const defeat = checkDefeat(nextState, defeatCtx);

  if (defeat) {
    nextState = {
      ...nextState,
      status: "FINISHED",
      winner: defeat.winner,
      winReason: defeat.reason,
    };
    nextState = emitEvent(nextState, "GAME_OVER", state.turn.activePlayerIndex, {
      winner: defeat.winner,
      reason: defeat.reason,
    });
    return {
      state: nextState,
      valid: true,
      gameOver: { winner: defeat.winner, reason: defeat.reason },
    };
  }

  // CONCEDE (and any action that sets FINISHED without going through defeat checks)
  if (nextState.status === "FINISHED" || nextState.status === "ABANDONED") {
    return {
      state: nextState,
      valid: true,
      gameOver: {
        winner: nextState.winner,
        reason: nextState.winReason ?? "Game over",
      },
    };
  }

  return { state: nextState, valid: true };
}

function fireEvents(
  state: GameState,
  execResult: ExecuteResult,
  action: GameAction,
): GameState {
  const pi = state.turn.activePlayerIndex;

  for (const event of execResult.events) {
    state = emitEvent(state, event.type, event.playerIndex ?? pi, event.payload ?? {});
  }

  // M4 hook: scan triggerRegistry for matches after events are emitted.
  // For now, only keyword-driven handlers (in execute.ts) produce side effects.
  void action; // will be used in M4 trigger matching
  return state;
}
