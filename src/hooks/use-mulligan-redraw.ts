"use client";

import React from "react";
import { useReducedMotion } from "motion/react";
import type { CardInstance } from "@shared/game-types";

export interface MulliganRedrawPlayback {
  oldHand: readonly CardInstance[];
  /** The redrawn hand, once the server sends it; null until then. */
  newHand: readonly CardInstance[] | null;
}

/**
 * Playback state for the opening-hand redraw (OPT-1060). `start` is called
 * when the viewer picks Redraw; it snapshots the current hand so the modal
 * can animate it back into the deck while the action is in flight. The new
 * hand is the first received hand that shares no instance id with the old
 * one (`applyMulligan` re-ids every returned card).
 *
 * The playback outlives the mulligan phase: when the viewer is the last to
 * decide, the server moves straight on to the game, and the modal stays up
 * until the deal finishes. Reduced motion never starts a playback.
 */
export function useMulliganRedraw(myHand: readonly CardInstance[]) {
  const reducedMotion = useReducedMotion() ?? false;
  const [playback, setPlayback] =
    React.useState<MulliganRedrawPlayback | null>(null);

  const start = React.useCallback(() => {
    if (reducedMotion || myHand.length === 0) return;
    setPlayback({ oldHand: myHand, newHand: null });
  }, [reducedMotion, myHand]);

  const finish = React.useCallback(() => setPlayback(null), []);

  const newHand =
    playback && !playback.newHand && isRedrawnHand(playback.oldHand, myHand)
      ? myHand
      : null;
  React.useEffect(() => {
    if (!newHand) return;
    setPlayback((current) =>
      current && !current.newHand ? { ...current, newHand } : current
    );
  }, [newHand]);

  return { playback, start, finish };
}

/** True when `hand` is a fresh hand: non-empty and sharing no instance id
 *  with `oldHand`. */
export function isRedrawnHand(
  oldHand: readonly CardInstance[],
  hand: readonly CardInstance[]
): boolean {
  if (hand.length === 0) return false;
  const oldIds = new Set(oldHand.map((card) => card.instanceId));
  return hand.every((card) => !oldIds.has(card.instanceId));
}
