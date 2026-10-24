import { battleCompletionOwnerViolation } from "./battle-completion-contract.js";
/** Native8 completion barrier: committed EOB events are separate from the
 * uncommitted expiry/return-to-Main obligation. Ordinary6/7 never create it. */
import type {
  BattleCompletionContinuation,
  ExecuteResult,
  GameState,
} from "../types.js";
import {
  continuationBoundary,
  popFrame,
  prependFrame,
} from "./effect-stack.js";
import { expireBattleEffects } from "./duration-tracker.js";
import { terminateForEngineContract } from "./engine-limits.js";

export function parkBattleCompletion(
  state: GameState,
  completion: BattleCompletionContinuation
): GameState {
  if (
    state.schemaVersion !== 8 ||
    state.effectStack.some((frame) => frame.battleCompletion)
  ) {
    return terminateForEngineContract(state, {
      kind: "ENGINE_CONTRACT",
      contract: "ACTION_HANDLER",
      message: "Battle completion requires one native8 owner",
    });
  }
  const boundary = continuationBoundary(
    state,
    completion.attackerInstanceId,
    completion.turnPlayerIndex
  );
  // Existing trigger execution can already own other generations. Completion
  // must sit below that whole owner, including its later reports and children.
  return prependFrame(boundary.state, {
    ...boundary.frame,
    battleCompletion: completion,
  });
}

export function completeBattleBoundary(state: GameState): ExecuteResult {
  const frame = state.effectStack.at(-1);
  const completion = frame?.battleCompletion;
  if (
    !completion ||
    state.schemaVersion !== 8 ||
    state.effectStack.length !== 1 ||
    battleCompletionOwnerViolation(frame!, state) !== null
  ) {
    return {
      state: terminateForEngineContract(state, {
        kind: "ENGINE_CONTRACT",
        contract: "ACTION_HANDLER",
        message: "Battle completion lost its exact battle/turn boundary",
      }),
      events: [],
    };
  }
  // Consume the sole obligation before expiry and before reporting anything it
  // releases. A child raised by the completion notification cannot replay it.
  let next = popFrame(state);
  next = expireBattleEffects(next, completion.battleId, "TURN_PLAYER");
  next = expireBattleEffects(next, completion.battleId, "NON_TURN_PLAYER");
  return {
    state: next,
    events: [
      { type: "BATTLE_RESOLVED", playerIndex: completion.turnPlayerIndex },
      {
        type: "PHASE_CHANGED",
        playerIndex: completion.turnPlayerIndex,
        payload: { from: "DAMAGE_STEP", to: "MAIN" },
      },
    ],
  };
}
