"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "@shared/game-types";

type TransientEventKey = string | number;

export type TransientEventKeySelector<Key extends TransientEventKey> = (
  event: GameEvent
) => Key | null;

/**
 * Shared event-log cursor and timeout lifecycle for one-shot board feedback.
 * Existing history is seeded on mount so reconnects do not replay effects.
 */
export function useTransientEventPulse<Key extends TransientEventKey>(
  eventLog: GameEvent[],
  durationMs: number,
  selectKey: TransientEventKeySelector<Key>,
  reducedMotion: boolean
): Set<Key> {
  const [activeKeys, setActiveKeys] = useState<Set<Key>>(() => new Set());
  const lastTimestampRef = useRef<number | null>(null);
  const timersRef = useRef<Map<Key, ReturnType<typeof setTimeout>>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = eventLog.reduce(
        (latest, event) => Math.max(latest, event.timestamp),
        0
      );
      return;
    }

    let maxTimestamp = lastTimestampRef.current;
    const nextKeys = new Set<Key>();

    for (const event of eventLog) {
      if (event.timestamp <= lastTimestampRef.current) continue;
      maxTimestamp = Math.max(maxTimestamp, event.timestamp);
      const key = selectKey(event);
      if (key !== null) nextKeys.add(key);
    }

    lastTimestampRef.current = maxTimestamp;

    if (reducedMotion) {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      queueMicrotask(() => {
        if (mountedRef.current) setActiveKeys(new Set());
      });
      return;
    }

    if (nextKeys.size === 0) return;

    queueMicrotask(() => {
      if (!mountedRef.current) return;
      setActiveKeys((previous) => {
        const next = new Set(previous);
        for (const key of nextKeys) next.add(key);
        return next;
      });
    });

    for (const key of nextKeys) {
      const currentTimer = timersRef.current.get(key);
      if (currentTimer) clearTimeout(currentTimer);

      const timer = setTimeout(() => {
        timersRef.current.delete(key);
        if (!mountedRef.current) return;
        setActiveKeys((previous) => {
          if (!previous.has(key)) return previous;
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      }, durationMs);

      timersRef.current.set(key, timer);
    }
  }, [durationMs, eventLog, reducedMotion, selectKey]);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;

    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return reducedMotion ? new Set<Key>() : activeKeys;
}
