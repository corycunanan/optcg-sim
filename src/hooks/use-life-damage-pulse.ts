"use client";

import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
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

  // Battle DAMAGE_DEALT is owned by the attacker. Life belongs to the other
  // player; lethal damage is excluded above because no life card was removed.
  return event.playerIndex === 0 ? 1 : 0;
};

/** Impact feedback for the life zone struck by non-lethal battle damage. */
export function useLifeDamagePulse(eventLog: GameEvent[]): Set<0 | 1> {
  const reducedMotion = useReducedMotion();

  return useTransientEventPulse(
    eventLog,
    LIFE_DAMAGE_PULSE_DURATION_MS,
    selectDamagedLifeOwner,
    !!reducedMotion
  );
}
