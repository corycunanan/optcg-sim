"use client";

import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const ATTACK_REDIRECTED_PULSE_DURATION_MS = 600;

const selectRedirectTarget: TransientEventKeySelector<string> = (event) =>
  event.type === "ATTACK_REDIRECTED" ? event.payload.newTargetInstanceId : null;

/** Amber sweep restart nonces keyed by the attack's new target. */
export function useAttackRedirectedPulse(
  eventLog: GameEvent[]
): ReadonlyMap<string, number> {
  const reducedMotion = useReducedMotion();

  return useTransientEventPulse(
    eventLog,
    ATTACK_REDIRECTED_PULSE_DURATION_MS,
    selectRedirectTarget,
    !!reducedMotion
  );
}
