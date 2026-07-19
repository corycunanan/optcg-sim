"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Pure helper — returns the subset of `current` not present in `prev`.
 * `prev === null` seeds the tracker (first render) → returns an empty set so
 * a page-level rehydrate doesn't replay the summon-entry pop for every
 * existing character.
 */
export function computeFieldArrivals(
  prev: Set<string> | null,
  current: Set<string>,
): Set<string> {
  if (prev === null) return new Set();
  const arrivals = new Set<string>();
  for (const id of current) {
    if (!prev.has(id)) arrivals.add(id);
  }
  return arrivals;
}

/**
 * Track which card `instanceId`s are new vs. the previous render.
 *
 * Arrivals are computed during render against the last committed snapshot so
 * consumers can pass `initial` to a wrapper on the render where it mounts.
 * The snapshot advances after commit, so later renders clear `arrivals`
 * without replaying Motion's mount-only initial state.
 */
export function useFieldArrivals(ids: Iterable<string>): Set<string> {
  const idList = [...ids];
  const key = idList.join("\u0000");
  const current = useMemo(
    () => new Set(key ? key.split("\u0000") : []),
    [key],
  );
  const seenIdsRef = useRef<Set<string> | null>(null);
  // Motion's mount-only `initial` prop requires this diff before commit. The
  // ref is only a snapshot of the last committed IDs and advances in effect.
  // eslint-disable-next-line react-hooks/refs
  const arrivals = computeFieldArrivals(seenIdsRef.current, current);

  useEffect(() => {
    seenIdsRef.current = current;
  }, [current]);

  return arrivals;
}
