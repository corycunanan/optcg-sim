"use client";

import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const TRIGGER_ACTIVATED_PULSE_DURATION_MS = 600;

const selectTriggerOwner: TransientEventKeySelector<0 | 1> = (event) =>
  event.type === "TRIGGER_ACTIVATED" && event.payload.activated === true
    ? event.playerIndex
    : null;

/** Life-zone feedback for accepted [Trigger] activations. */
export function useTriggerActivatedPulse(eventLog: GameEvent[]): Set<0 | 1> {
  const reducedMotion = useReducedMotion();

  return useTransientEventPulse(
    eventLog,
    TRIGGER_ACTIVATED_PULSE_DURATION_MS,
    selectTriggerOwner,
    !!reducedMotion
  );
}
