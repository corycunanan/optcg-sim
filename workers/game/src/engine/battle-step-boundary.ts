/** A next-step notification is conditional until its owning battle window
 * finishes (7-1-1-4, 7-1-2-3). The existing root execution frame owns it. */
import type { GameState, PendingEvent } from "../types.js";
import {
  createEffectExecutionScope,
  triggerExecutionOwner,
} from "./trigger-executor.js";

export function isPendingBattleStepTransition(event: PendingEvent): boolean {
  return (
    !event.propagation?.eventLogEmitted &&
    event.type === "PHASE_CHANGED" &&
    ((event.payload?.from === "ATTACK_STEP" &&
      event.payload.to === "BLOCK_STEP") ||
      (event.payload?.from === "BLOCK_STEP" &&
        event.payload.to === "COUNTER_STEP"))
  );
}

export function holdBattleStepTransitions(
  state: GameState,
  events: readonly PendingEvent[]
): GameState {
  const held = events.filter(isPendingBattleStepTransition);
  if (!held.length || !state.turn.battle) return state;
  state = createEffectExecutionScope(
    state,
    state.turn.battle.attackerInstanceId,
    state.turn.activePlayerIndex
  );
  const owner = triggerExecutionOwner(state);
  if (!owner) return state;
  return {
    ...state,
    effectStack: state.effectStack.map((frame) =>
      frame.id === owner.id
        ? {
            ...frame,
            accumulatedEvents: [
              ...new Set([...frame.accumulatedEvents, ...held]),
            ],
          }
        : frame
    ),
  };
}
