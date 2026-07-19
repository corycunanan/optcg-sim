"use client";

import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const EFFECTS_NEGATED_PULSE_DURATION_MS = 700;

const selectNegatedGroup: TransientEventKeySelector<string> = (event) => {
  if (event.type !== "EFFECTS_NEGATED") return null;
  const targetIds = [...new Set(event.payload.targetInstanceIds)].sort();
  return targetIds.length > 0 ? JSON.stringify(targetIds) : null;
};

/** Desaturated-ring restart keys for every target in EFFECTS_NEGATED. */
export function useEffectsNegatedPulse(
  eventLog: GameEvent[]
): ReadonlyMap<string, string> {
  const reducedMotion = useReducedMotion();
  const pulses = useTransientEventPulse(
    eventLog,
    EFFECTS_NEGATED_PULSE_DURATION_MS,
    selectNegatedGroup,
    !!reducedMotion
  );

  return useMemo(() => {
    const result = new Map<string, string>();
    for (const [groupKey, nonce] of pulses) {
      const targetIds = JSON.parse(groupKey) as string[];
      for (const targetId of targetIds) {
        result.set(targetId, `${groupKey}:${nonce}`);
      }
    }
    return result;
  }, [pulses]);
}
