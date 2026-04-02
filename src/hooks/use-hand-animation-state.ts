"use client";

import { useMemo } from "react";
import type { CardInstance } from "@shared/game-types";
import type { CardTransition } from "./use-card-transitions";

export interface HandAnimationState {
  /** Count map of cardIds in-flight to each hand zone key. */
  inFlightByZone: Record<string, Map<string, number>>;
  /** Card instanceIds currently in-flight to a specific hand zone. */
  inFlightInstanceIds: Set<string>;
  /** Total number of cards that will be in hand after flights complete. */
  projectedCount: number;
}

/**
 * Coordinates flight animations with hand layout.
 *
 * Bridges useCardTransitions (which tracks active flights) with HandLayer
 * (which needs to know which cards are invisible placeholders and where
 * arriving cards will land).
 *
 * Phase 3 will extend this to provide:
 * - Target indices for arriving cards (where in the fan they land)
 * - Stagger delays for multi-card draws
 * - Layout animation coordination signals
 */
export function useHandAnimationState(
  transitions: CardTransition[],
  handCards: CardInstance[],
  zoneKey: string,
): HandAnimationState {
  const inFlightByZone = useMemo(() => {
    const counts: Record<string, Map<string, number>> = {};
    for (const t of transitions) {
      if (t.toZoneKey.endsWith("-hand") && t.cardId) {
        const map = (counts[t.toZoneKey] ??= new Map());
        map.set(t.cardId, (map.get(t.cardId) ?? 0) + 1);
      }
    }
    return counts;
  }, [transitions]);

  const inFlightInstanceIds = useMemo(() => {
    const ids = new Set<string>();
    // Cards departing from this hand zone
    for (const t of transitions) {
      if (t.fromZoneKey === zoneKey && t.cardId) {
        // Find matching card in hand by cardId
        for (const card of handCards) {
          if (card.cardId === t.cardId) {
            ids.add(card.instanceId);
            break;
          }
        }
      }
    }
    // Cards arriving to this hand zone (matched by cardId in hand)
    const arriving = inFlightByZone[zoneKey];
    if (arriving) {
      const remainingCounts = new Map(arriving);
      for (const card of handCards) {
        const remaining = remainingCounts.get(card.cardId);
        if (remaining && remaining > 0) {
          ids.add(card.instanceId);
          remainingCounts.set(card.cardId, remaining - 1);
        }
      }
    }
    return ids;
  }, [transitions, handCards, zoneKey, inFlightByZone]);

  const arrivingCount = useMemo(() => {
    const map = inFlightByZone[zoneKey];
    if (!map) return 0;
    let total = 0;
    for (const count of map.values()) total += count;
    return total;
  }, [inFlightByZone, zoneKey]);

  const projectedCount = handCards.length + arrivingCount;

  return {
    inFlightByZone,
    inFlightInstanceIds,
    projectedCount,
  };
}
