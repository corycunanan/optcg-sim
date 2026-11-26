"use client";

import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "@shared/game-types";
import { buildEventTimeline, eventOffsetMs } from "@/lib/game/event-timeline";

type TransientEventKey = string | number;

export type TransientEventKeySelector<Key extends TransientEventKey> = (
  event: GameEvent
) => Key | null;

export type TransientEventPulses<Key extends TransientEventKey> = ReadonlyMap<
  Key,
  number
>;

/**
 * Shared event-log cursor and timeout lifecycle for one-shot board feedback.
 * Existing history is seeded on mount so reconnects do not replay effects.
 * Each pulse waits for its event's beat in the update's playback timeline
 * (OPT-1040), so glows follow the flights and spotlights before them.
 */
export function useTransientEventPulse<Key extends TransientEventKey>(
  eventLog: GameEvent[],
  durationMs: number,
  selectKey: TransientEventKeySelector<Key>,
  reducedMotion: boolean
): TransientEventPulses<Key> {
  const [activePulses, setActivePulses] = useState<Map<Key, number>>(
    () => new Map()
  );
  const lastTimestampRef = useRef<number | null>(null);
  const pendingCountsRef = useRef<Map<Key, number>>(new Map());
  const nonceByKeyRef = useRef<Map<Key, number>>(new Map());
  const timersRef = useRef<Map<Key, ReturnType<typeof setTimeout>>>(new Map());
  const scheduledKeysRef = useRef<Set<Key>>(new Set());
  const beatTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = eventLog.reduce(
        (latest, event) => Math.max(latest, event.timestamp),
        0
      );
      return;
    }

    const startNextPulse = (key: Key) => {
      if (!mountedRef.current || reducedMotion) return;

      const pendingCount = pendingCountsRef.current.get(key) ?? 0;
      if (pendingCount === 0) return;

      if (pendingCount === 1) pendingCountsRef.current.delete(key);
      else pendingCountsRef.current.set(key, pendingCount - 1);

      const nonce = (nonceByKeyRef.current.get(key) ?? 0) + 1;
      nonceByKeyRef.current.set(key, nonce);
      setActivePulses((previous) => {
        const next = new Map(previous);
        next.set(key, nonce);
        return next;
      });

      const timer = setTimeout(() => {
        timersRef.current.delete(key);
        if (!mountedRef.current) return;

        if ((pendingCountsRef.current.get(key) ?? 0) > 0) {
          startNextPulse(key);
          return;
        }

        setActivePulses((previous) => {
          if (!previous.has(key)) return previous;
          const next = new Map(previous);
          next.delete(key);
          return next;
        });
      }, durationMs);

      timersRef.current.set(key, timer);
    };

    const enqueue = (key: Key, count: number) => {
      if (!mountedRef.current) return;
      pendingCountsRef.current.set(
        key,
        (pendingCountsRef.current.get(key) ?? 0) + count
      );

      if (timersRef.current.has(key) || scheduledKeysRef.current.has(key)) {
        return;
      }

      scheduledKeysRef.current.add(key);
      queueMicrotask(() => {
        scheduledKeysRef.current.delete(key);
        startNextPulse(key);
      });
    };

    let maxTimestamp = lastTimestampRef.current;
    const newEvents: GameEvent[] = [];

    for (const event of eventLog) {
      if (event.timestamp <= lastTimestampRef.current) continue;
      maxTimestamp = Math.max(maxTimestamp, event.timestamp);
      newEvents.push(event);
    }

    lastTimestampRef.current = maxTimestamp;

    if (reducedMotion) {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      for (const timer of beatTimersRef.current) clearTimeout(timer);
      beatTimersRef.current.clear();
      pendingCountsRef.current.clear();
      scheduledKeysRef.current.clear();
      queueMicrotask(() => {
        if (mountedRef.current) setActivePulses(new Map());
      });
      return;
    }

    // Group this update's pulses by beat offset, preserving event order.
    const timeline = buildEventTimeline(newEvents);
    const countsByOffset = new Map<number, Map<Key, number>>();
    for (const event of newEvents) {
      const key = selectKey(event);
      if (key === null) continue;
      const offset = eventOffsetMs(timeline, event);
      const counts = countsByOffset.get(offset) ?? new Map<Key, number>();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      countsByOffset.set(offset, counts);
    }

    for (const [offset, counts] of countsByOffset) {
      if (offset <= 0) {
        for (const [key, count] of counts) enqueue(key, count);
        continue;
      }
      const timer = setTimeout(() => {
        beatTimersRef.current.delete(timer);
        for (const [key, count] of counts) enqueue(key, count);
      }, offset);
      beatTimersRef.current.add(timer);
    }
  }, [durationMs, eventLog, reducedMotion, selectKey]);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    const pendingCounts = pendingCountsRef.current;
    const scheduledKeys = scheduledKeysRef.current;
    const beatTimers = beatTimersRef.current;

    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const timer of beatTimers) clearTimeout(timer);
      beatTimers.clear();
      pendingCounts.clear();
      scheduledKeys.clear();
    };
  }, []);

  return reducedMotion ? new Map<Key, number>() : activePulses;
}
