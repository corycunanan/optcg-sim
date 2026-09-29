/** Serializable staged state for an in-progress multi-cost transaction. */
import type { GameState } from "../../../types.js";
import { expireSourceLeftZone } from "../../duration-tracker.js";

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

function fieldInstanceIds(state: GameState): string[] {
  return state.players.flatMap((player) => [
    player.leader.instanceId,
    ...player.characters.flatMap((card) => (card ? [card.instanceId] : [])),
    ...(player.stage ? [player.stage.instanceId] : []),
  ]);
}

/**
 * OPT-869: the state a pending cost reply's prohibition coverage is read in.
 *
 * Rule 8-3-1-1: costs are paid in order, so a later cost sees what earlier
 * staged costs did — e.g. trashing the source of a permanent CANNOT_ATTACH_DON
 * aura ends that aura before a following GIVE_DON. That is the `staged`
 * payment state. The `live` (pre-cost) state still holds such a prohibition,
 * so it must not veto the reply by itself.
 *
 * A prohibition present only in `live` (it appeared after the offer, through
 * a change the staged costs did not make) is still carried in, unless the
 * staged costs explain its absence: its source left the field in the staged
 * payment, which is exactly the `expireSourceLeftZone` cleanup that removed
 * it there. Conditions and dynamic coverage then evaluate against the staged
 * board.
 */
export function stagedProhibitionView(live: GameState, staged: GameState): GameState {
  const stagedIds = new Set(staged.prohibitions.map((p) => p.id));
  const liveOnly = live.prohibitions.filter((p) => !stagedIds.has(p.id));
  if (liveOnly.length === 0) return staged;
  let merged: GameState = { ...staged, prohibitions: [...staged.prohibitions, ...liveOnly] };
  const stagedField = new Set(fieldInstanceIds(staged));
  for (const id of fieldInstanceIds(live)) {
    if (!stagedField.has(id)) merged = expireSourceLeftZone(merged, id);
  }
  // Only the prohibition list is reconciled; everything else stays staged.
  return { ...staged, prohibitions: merged.prohibitions };
}
