"use client";

import { useEffect, useMemo, useReducer } from "react";

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
 * The previous-id snapshot is updated after commit so React Compiler does not
 * see ref reads/writes during render.
 */
export function useFieldArrivals(ids: Iterable<string>): Set<string> {
  const idList = [...ids];
  const key = idList.join("\u0000");
  const current = useMemo(
    () => new Set(key ? key.split("\u0000") : []),
    [key],
  );
  const [state, update] = useReducer(
    (
      prev: { key: string; current: Set<string> | null; arrivals: Set<string> },
      next: { key: string; current: Set<string> },
    ) => ({
      key: next.key,
      current: next.current,
      arrivals: computeFieldArrivals(prev.current, next.current),
    }),
    { key: "", current: null, arrivals: new Set<string>() },
  );

  useEffect(() => {
    update({ key, current });
  }, [key, current]);

  return state.key === key ? state.arrivals : new Set();
}
