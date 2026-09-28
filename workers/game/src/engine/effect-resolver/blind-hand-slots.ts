/**
 * Opaque, per-prompt shuffled slots for blind choices from a hand (OPT-838).
 *
 * A blind chooser must not be able to identify a hand card by its instance id
 * (seen earlier in a reveal) or by its hand position (the card just drawn is
 * last). Each blind hand prompt therefore offers fresh tokens, shuffled with
 * the persisted engine RNG, and keeps the token → instance mapping only on the
 * server-side prompt (`PendingPromptState.blindSlots`).
 */

import type {
  BlindHandSlot,
  CardInstance,
  GameState,
  PendingPromptState,
} from "../../types.js";
import {
  allocateEngineId,
  shuffleWithEngineContext,
} from "../execution-context.js";

const HIDDEN_CARD_ID = "hidden";

export interface BlindHandSlotPrompt {
  state: GameState;
  /** Tokens in display order; use as the prompt's `validTargets`. */
  validTargets: string[];
  /** Face-down placeholders carrying only the tokens; use as prompt `cards`. */
  cards: CardInstance[];
  blindSlots: BlindHandSlot[];
}

/** Builds shuffled opaque slots for `candidates` from `handOwner`'s hand. */
export function createBlindHandSlots(
  state: GameState,
  candidates: readonly CardInstance[],
  handOwner: 0 | 1,
): BlindHandSlotPrompt {
  const shuffled = shuffleWithEngineContext(state, candidates);
  const nonce = allocateEngineId(shuffled.state, "blind");
  const blindSlots = shuffled.values.map((card, index) => ({
    token: `${nonce.id}-${index + 1}`,
    instanceId: card.instanceId,
  }));
  return {
    state: nonce.state,
    validTargets: blindSlots.map((slot) => slot.token),
    // Read-only placeholders: every field is rebuilt from public facts (the
    // zone, owner and a fresh token) so no per-card metadata survives.
    cards: shuffled.values.map((card, index) => ({
      instanceId: blindSlots[index].token,
      cardId: HIDDEN_CARD_ID,
      zone: card.zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: handOwner,
      owner: handOwner,
    })),
    blindSlots,
  };
}

/**
 * Translates a reply's tokens to instance ids. Returns null when any selected
 * id is not one of this prompt's tokens (for example a real instance id or a
 * token from an earlier prompt).
 */
export function translateBlindHandSelection(
  prompt: Pick<PendingPromptState, "blindSlots">,
  selected: readonly string[],
): string[] | null {
  const slots = prompt.blindSlots;
  if (!slots) return [...selected];
  const byToken = new Map(slots.map((slot) => [slot.token, slot.instanceId]));
  const translated: string[] = [];
  for (const token of selected) {
    const instanceId = byToken.get(token);
    if (instanceId === undefined) return null;
    translated.push(instanceId);
  }
  return translated;
}
