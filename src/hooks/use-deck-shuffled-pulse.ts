"use client";

import type { GameEvent } from "@shared/game-types";
import { deckRiffle } from "@/lib/motion";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

/** A shuffle's riffle plus the pile pop that closes it. */
export const DECK_SHUFFLED_PULSE_DURATION_MS =
  deckRiffle.totalMs + deckRiffle.popMs;

const selectDeckOwner: TransientEventKeySelector<0 | 1> = (event) =>
  event.type === "DECK_SHUFFLED" ? event.playerIndex : null;

/**
 * OPT-1055: riffle restart nonces keyed by the shuffled deck's owner. Reduced
 * motion still delivers nonces: `DeckRiffle` then plays the pile pop only.
 */
export function useDeckShuffledPulse(
  eventLog: GameEvent[]
): ReadonlyMap<0 | 1, number> {
  return useTransientEventPulse(
    eventLog,
    DECK_SHUFFLED_PULSE_DURATION_MS,
    selectDeckOwner,
    false
  );
}
