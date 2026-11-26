"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pileReceiptAggregateWindowMs } from "@/lib/motion";

export interface PileReceiptState {
  id: string;
  /** Cards that arrived (positive) or left (negative, Life only). */
  count: number;
}

let receiptCounter = 0;

/** Positive count growth is an arrival; rehydrate and removals are silent. */
export function pileArrivalDelta(
  previousCount: number | null,
  visibleCount: number
): number {
  if (previousCount === null) return 0;
  return Math.max(0, visibleCount - previousCount);
}

/** Reconcile a debounced receipt when a transition reservation temporarily
 *  hides an arrival after the server-confirmed pile has already rendered. */
export function reconcilePendingPileArrival(
  pendingCount: number,
  previousCount: number | null,
  visibleCount: number
): number {
  if (previousCount === null) return pendingCount;
  return Math.max(0, pendingCount + visibleCount - previousCount);
}

/** Cards that left a pile beyond the arrivals still waiting to be
 *  acknowledged: a reservation that briefly hides an arrival the pile already
 *  rendered is not a removal (OPT-1059). */
export function pileRemovalDelta(
  previousCount: number | null,
  visibleCount: number,
  pendingArrivals: number
): number {
  if (previousCount === null) return 0;
  return Math.max(0, previousCount - visibleCount - pendingArrivals);
}

/**
 * Converts visible pile-count growth into one transient +N receipt. Staggered
 * transition siblings complete about 60ms apart, so the short debounce folds
 * them into a single batch acknowledgment instead of stacking floaters.
 */
export function usePileReceipt(
  visibleCount: number,
  { removals = false }: { removals?: boolean } = {}
) {
  const previousCountRef = useRef<number | null>(null);
  const pendingCountRef = useRef(0);
  const pendingRemovalRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [receipt, setReceipt] = useState<PileReceiptState | null>(null);

  useEffect(() => {
    const previousCount = previousCountRef.current;
    const delta = pileArrivalDelta(previousCount, visibleCount);
    // A pile that opts in (Life) also acknowledges cards leaving with −N.
    const removed = removals
      ? pileRemovalDelta(previousCount, visibleCount, pendingCountRef.current)
      : 0;
    pendingRemovalRef.current += removed;
    pendingCountRef.current = reconcilePendingPileArrival(
      pendingCountRef.current,
      previousCount,
      visibleCount
    );
    previousCountRef.current = visibleCount;
    if (delta === 0 && removed === 0) {
      if (
        pendingCountRef.current === 0 &&
        pendingRemovalRef.current === 0 &&
        timerRef.current
      ) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Arrivals win a window that saw both; it is the move being shown.
      const count =
        pendingCountRef.current > 0
          ? pendingCountRef.current
          : -pendingRemovalRef.current;
      pendingCountRef.current = 0;
      pendingRemovalRef.current = 0;
      timerRef.current = null;
      if (count === 0) return;
      setReceipt({ id: `pile-receipt-${++receiptCounter}`, count });
    }, pileReceiptAggregateWindowMs);
  }, [visibleCount, removals]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const clearReceipt = useCallback((id: string) => {
    setReceipt((current) => (current?.id === id ? null : current));
  }, []);

  return { receipt, clearReceipt };
}
