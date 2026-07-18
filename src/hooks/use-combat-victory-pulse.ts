"use client";

import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const COMBAT_VICTORY_PULSE_DURATION_MS = 600;

const selectCombatVictor: TransientEventKeySelector<string> = (event) =>
  event.type === "COMBAT_VICTORY" ? event.payload.cardInstanceId : null;

/** Transient winner feedback keyed strictly from COMBAT_VICTORY events. */
export function useCombatVictoryPulse(eventLog: GameEvent[]): Set<string> {
  const reducedMotion = useReducedMotion();

  return useTransientEventPulse(
    eventLog,
    COMBAT_VICTORY_PULSE_DURATION_MS,
    selectCombatVictor,
    !!reducedMotion
  );
}
