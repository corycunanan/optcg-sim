"use client";

import { useReducedMotion } from "motion/react";
import { damagedPlayerOf, type GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventPulses,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const LIFE_DAMAGE_PULSE_DURATION_MS = 600;

const selectDamagedLifeOwner: TransientEventKeySelector<0 | 1> = (event) => {
  if (
    event.type !== "DAMAGE_DEALT" ||
    event.payload.amount <= 0 ||
    event.payload.lethal === true
  ) {
    return null;
  }

  // DAMAGE_DEALT is owned by the dealer; the struck Life belongs to the
  // damaged player (OPT-887). Lethal damage is excluded above because no Life
  // card was removed.
  return damagedPlayerOf(event);
};

/** Impact feedback for the life zone struck by non-lethal battle or effect damage. */
export function useLifeDamagePulse(
  eventLog: GameEvent[]
): TransientEventPulses<0 | 1> {
  const reducedMotion = useReducedMotion();

  return useTransientEventPulse(
    eventLog,
    LIFE_DAMAGE_PULSE_DURATION_MS,
    selectDamagedLifeOwner,
    !!reducedMotion
  );
}
