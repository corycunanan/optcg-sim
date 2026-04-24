"use client";

import { useRef } from "react";

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
 * Pure bookkeeping: no effects, no state; safe to call during render.
 */
export function useFieldArrivals(ids: Iterable<string>): Set<string> {
  const prevRef = useRef<Set<string> | null>(null);
  const current = new Set(ids);
  const arrivals = computeFieldArrivals(prevRef.current, current);
  prevRef.current = current;
  return arrivals;
}
