"use client";

import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const LIFE_SCRIED_PULSE_DURATION_MS = 600;

const selectLifeOwner: TransientEventKeySelector<0 | 1> = (event) =>
  event.type === "LIFE_SCRIED" ? event.playerIndex : null;

/** Cool inspection-pulse restart nonces keyed by the scrying player. */
export function useLifeScriedPulse(
  eventLog: GameEvent[]
): ReadonlyMap<0 | 1, number> {
  const reducedMotion = useReducedMotion();

  return useTransientEventPulse(
    eventLog,
    LIFE_SCRIED_PULSE_DURATION_MS,
    selectLifeOwner,
    !!reducedMotion
  );
}
