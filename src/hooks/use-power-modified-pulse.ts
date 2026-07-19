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
  kind: "delta" | "absolute";
  value: number;
  nonce: number;
}

const selectPowerTarget: TransientEventKeySelector<string> = (event) =>
  event.type === "POWER_MODIFIED" ? event.payload.targetInstanceId : null;

function readPowerChange(
  event: Extract<GameEvent, { type: "POWER_MODIFIED" }>,
): Omit<PowerModPulse, "nonce"> | null {
  // Engine MODIFY_POWER emitters send an additive `amount`. SET_POWER,
  // SET_POWER_TO_ZERO, COPY_POWER, and SWAP_POWER emit an absolute `value`;
  // the client has no reliable pre-event effective power snapshot from which
  // to derive a true delta, so those events are labeled as replacements.
  if (event.payload.amount !== undefined) {
    return { kind: "delta", value: event.payload.amount };
  }
  if (event.payload.value !== undefined) {
    return { kind: "absolute", value: event.payload.value };
  }
  return null;
}

/** Floating power changes keyed by target card, with per-target restart nonces. */
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

  const changesByTarget = useMemo(() => {
    const result = new Map<
      string,
      Array<Omit<PowerModPulse, "nonce"> | null>
    >();
    for (const event of eventLog) {
      if (
        event.timestamp <= mountedAtTimestamp ||
        event.type !== "POWER_MODIFIED"
      ) {
        continue;
      }
      const targetId = event.payload.targetInstanceId;
      const changes = result.get(targetId) ?? [];
      changes.push(readPowerChange(event));
      result.set(targetId, changes);
    }
    return result;
  }, [eventLog, mountedAtTimestamp]);

  return useMemo(() => {
    const result = new Map<string, PowerModPulse>();
    for (const [targetId, nonce] of pulses) {
      const changes = changesByTarget.get(targetId);
      const indexedChange = changes?.[nonce - 1];
      const change =
        indexedChange === undefined ? changes?.at(-1) : indexedChange;
      if (change) result.set(targetId, { ...change, nonce });
    }
    return result;
  }, [changesByTarget, pulses]);
}
