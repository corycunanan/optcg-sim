/** Serializable staged state for an in-progress multi-cost transaction. */
import type { GameState } from "../../../types.js";

export type CostTransactionState = Pick<
  GameState,
  | "players"
  | "turn"
  | "activeEffects"
  | "prohibitions"
  | "scheduledActions"
  | "oneTimeModifiers"
  | "triggerRegistry"
>;

export function captureCostTransactionState(
  state: GameState,
): CostTransactionState {
  return {
    players: state.players,
    turn: state.turn,
    activeEffects: state.activeEffects,
    prohibitions: state.prohibitions,
    scheduledActions: state.scheduledActions,
    oneTimeModifiers: state.oneTimeModifiers,
    triggerRegistry: state.triggerRegistry,
  };
}

/** Overlay staged cost mutations while preserving live stack/prompt metadata. */
export function applyCostTransactionState(
  state: GameState,
  staged: CostTransactionState,
): GameState {
  return { ...state, ...staged };
}
