"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEvent, TurnState } from "@shared/game-types";

/**
 * Transient pulse state for the defender when a counter is used (OPT-273).
 *
 * The `COUNTER_USED` event fires when the defender plays a counter card —
 * the counter goes to trash (handled by the flight layer) and the defender's
 * power increases. This hook maintains a short-lived set of instanceIds that
 * consumers wire to `highlightRing="counter"` on the defending card so the
 * ring flashes briefly and then clears.
 *
 * Identifier: the defender is `battle.targetInstanceId` on the current turn.
 * A counter without an active battle is ignored (COUNTER_USED only fires
 * during BLOCK_STEP / COUNTER_STEP, but the guard keeps the hook robust).
 */
export const COUNTER_PULSE_DURATION_MS = 520;

/**
 * Pure helper — counts the number of new `COUNTER_USED` events past the last
 * seen timestamp. Exported for unit testing; the hook wraps this with state.
 */
export function countNewCounterEvents(
  eventLog: GameEvent[],
  sinceTimestamp: number,
): { count: number; maxTimestamp: number } {
  let count = 0;
  let maxTs = sinceTimestamp;
  for (const ev of eventLog) {
    if (ev.timestamp <= sinceTimestamp) continue;
    if (ev.timestamp > maxTs) maxTs = ev.timestamp;
    if (ev.type === "COUNTER_USED") count += 1;
  }
  return { count, maxTimestamp: maxTs };
}

export function useCounterPulse(
  eventLog: GameEvent[],
  battle: TurnState["battle"] | null,
): Set<string> {
  const [pulsing, setPulsing] = useState<Set<string>>(() => new Set());
  const lastTimestampRef = useRef<number | null>(null);
  const defenderId = battle?.targetInstanceId ?? null;

  useEffect(() => {
    if (lastTimestampRef.current === null) {
      const last = eventLog[eventLog.length - 1];
      lastTimestampRef.current = last ? last.timestamp : 0;
      return;
    }

    const { count, maxTimestamp } = countNewCounterEvents(
      eventLog,
      lastTimestampRef.current,
    );
    lastTimestampRef.current = maxTimestamp;

    if (count === 0) return;
    if (!defenderId) return;

    // Capture the defender at the moment the event fires so the cleanup
    // timer removes the exact id we added, even if the battle advances
    // (new defender) before the pulse fades.
    const pulsedId = defenderId;

    setPulsing((prev) => {
      if (prev.has(pulsedId)) return prev;
      const next = new Set(prev);
      next.add(pulsedId);
      return next;
    });

    const timer = setTimeout(() => {
      setPulsing((prev) => {
        if (!prev.has(pulsedId)) return prev;
        const next = new Set(prev);
        next.delete(pulsedId);
        return next;
      });
    }, COUNTER_PULSE_DURATION_MS);

    return () => clearTimeout(timer);
  }, [eventLog, defenderId]);

  return pulsing;
}
