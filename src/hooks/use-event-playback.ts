"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { GameEvent } from "@shared/game-types";
import { buildEventTimeline } from "@/lib/game/event-timeline";

/**
 * True while the newest update's board effects are still playing back
 * (OPT-1040), for an update with two or more sequenced steps. The board holds
 * prompts and input until the last step has landed, so a player never
 * answers a prompt about a step they have not seen.
 * History present on mount is never replayed.
 */
export function useEventPlayback(eventLog: GameEvent[]): boolean {
  const reducedMotion = useReducedMotion();
  const lastTimestampRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingUntilRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useLayoutEffect(() => {
    const latest = eventLog.at(-1)?.timestamp ?? null;
    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = latest ?? -1;
      return;
    }
    if (eventLog.length === 0) {
      lastTimestampRef.current = -1;
      return;
    }

    const since = lastTimestampRef.current;
    const newEvents = eventLog.filter((event) => event.timestamp > since);
    if (newEvents.length === 0) return;
    lastTimestampRef.current = latest ?? since;

    const { durationMs, beatCount } = buildEventTimeline(newEvents, {
      reducedMotion: !!reducedMotion,
    });
    // A single step reads on its own and holds nothing back, so routine
    // plays do not flicker the board's controls.
    if (beatCount < 2 || durationMs <= 0) return;

    // A newer update extends playback; it never cuts a running one short.
    const now = Date.now();
    const until = Math.max(playingUntilRef.current, now + durationMs);
    playingUntilRef.current = until;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsPlaying(false);
    }, until - now);
    // Mirroring the websocket's event stream into transient playback state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(true);
  }, [eventLog, reducedMotion]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return isPlaying;
}
