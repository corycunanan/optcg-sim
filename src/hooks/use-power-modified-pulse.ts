"use client";

import { useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import {
  useTransientEventPulse,
  type TransientEventKeySelector,
} from "./use-transient-event-pulse";

export const POWER_MODIFIED_PULSE_DURATION_MS = 800;

export interface PowerModPulse {
  delta: number;
  nonce: number;
}

const selectPowerTarget: TransientEventKeySelector<string> = (event) =>
  event.type === "POWER_MODIFIED" ? event.payload.targetInstanceId : null;

function readPowerDelta(event: Extract<GameEvent, { type: "POWER_MODIFIED" }>) {
  return event.payload.amount ?? event.payload.value ?? 0;
}

/** Floating power deltas keyed by target card, with per-target restart nonces. */
export function usePowerModifiedPulse(
  eventLog: GameEvent[]
): ReadonlyMap<string, PowerModPulse> {
  const reducedMotion = useReducedMotion();
  const [mountedAtTimestamp] = useState(() =>
    eventLog.reduce((latest, event) => Math.max(latest, event.timestamp), 0)
  );
  const pulses = useTransientEventPulse(
    eventLog,
    POWER_MODIFIED_PULSE_DURATION_MS,
    selectPowerTarget,
    !!reducedMotion
  );

  const deltasByTarget = useMemo(() => {
    const result = new Map<string, number[]>();
    for (const event of eventLog) {
      if (
        event.timestamp <= mountedAtTimestamp ||
        event.type !== "POWER_MODIFIED"
      ) {
        continue;
      }
      const targetId = event.payload.targetInstanceId;
      const deltas = result.get(targetId) ?? [];
      deltas.push(readPowerDelta(event));
      result.set(targetId, deltas);
    }
    return result;
  }, [eventLog, mountedAtTimestamp]);

  return useMemo(() => {
    const result = new Map<string, PowerModPulse>();
    for (const [targetId, nonce] of pulses) {
      const deltas = deltasByTarget.get(targetId);
      const delta = deltas?.[nonce - 1] ?? deltas?.at(-1) ?? 0;
      result.set(targetId, { delta, nonce });
    }
    return result;
  }, [deltasByTarget, pulses]);
}
