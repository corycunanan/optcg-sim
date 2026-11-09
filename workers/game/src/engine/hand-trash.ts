import type { GameState, PendingEvent } from "../types.js";
import type { EffectResult } from "./effect-types.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "./effect-types.js";
import { effectSourceCard } from "./effect-source.js";

export const TRIGGERING_HAND_TRASH_REF = "__triggering_hand_trash";

/** Whether a card left `playerIndex`'s hand for the trash by an effect during
 * the current turn (OPT-1034, ST33-004). Reads the event log back to this
 * turn's TURN_STARTED, so it needs no extra saved state: the turn boundary
 * resets it, and both players are covered. A CARD_TRASHED event's player is
 * whose hand lost the cards; who caused the trash does not matter. */
export function handTrashedByEffectThisTurn(
  state: GameState,
  playerIndex: 0 | 1
): boolean {
  for (let i = state.eventLog.length - 1; i >= 0; i--) {
    const event = state.eventLog[i];
    if (event.type === "TURN_STARTED") return false;
    if (event.playerIndex === playerIndex && isHandTrashByEffect(event))
      return true;
  }
  return false;
}

/** One event per simultaneous hand discard, with its actual moved count.
 * OP12 Garp FAQ supports activation-cost discards. Applying this to OP14 is
 * an explicitly user-authorized inference, not a direct OP14 cost ruling.
 * COST remains distinct from EFFECT; neither Counter nor rule disposal qualifies.
 */
export function handTrashEvent(
  state: GameState,
  playerIndex: 0 | 1,
  count: number,
  movementCause: "COST" | "EFFECT",
  sourceCardInstanceId: string | undefined,
  causingController: 0 | 1,
  resultRefs?: Map<string, EffectResult>
): Extract<PendingEvent, { type: "CARD_TRASHED" }> {
  const source = sourceCardInstanceId
    ? effectSourceCard(
        state,
        sourceCardInstanceId,
        resultRefs?.get(EFFECT_SOURCE_SNAPSHOT_REF)?.sourceIdentity ??
          resultRefs?.get(EFFECT_SOURCE_SNAPSHOT_REF)?.sourceCardSnapshot
      )
    : undefined;
  return {
    type: "CARD_TRASHED",
    playerIndex,
    payload: {
      count,
      reason: movementCause === "COST" ? "cost" : "effect",
      from: "HAND",
      sourceZone: "HAND",
      sourceController: playerIndex,
      movementCause,
      causingController: source?.controller ?? causingController,
      ...(source
        ? {
            effectSourceCardId: source.cardId,
            effectSourceController: source.controller,
          }
        : {}),
    },
  };
}

export function isHandTrashByEffect(event: PendingEvent): boolean {
  return (
    event.type === "CARD_TRASHED" &&
    event.payload?.from === "HAND" &&
    (event.payload?.count ?? 0) > 0 &&
    (event.payload?.movementCause === "EFFECT" ||
      event.payload?.movementCause === "COST") &&
    event.payload?.effectSourceCardId !== undefined &&
    event.payload?.effectSourceController !== undefined
  );
}

/** Complete causal snapshots for multi-step costs whose source already left.
 * Called before committed-cost trigger scanning/publication; never rewrites
 * a replacement effect's own source or already-attributed hand discard.
 */
export function completeHandTrashCostSources(
  events: PendingEvent[],
  state: GameState,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  resultRefs: Map<string, EffectResult>
): void {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (
      event.type !== "CARD_TRASHED" ||
      event.payload?.from !== "HAND" ||
      event.payload.movementCause !== "COST" ||
      event.payload.effectSourceCardId
    )
      continue;
    const attributed = handTrashEvent(
      state,
      event.playerIndex ?? controller,
      event.payload.count ?? 0,
      "COST",
      sourceCardInstanceId,
      controller,
      resultRefs
    );
    events[i] = { ...event, payload: attributed.payload } as PendingEvent;
  }
}
