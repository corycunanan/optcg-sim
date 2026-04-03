"use client";

import { useMemo } from "react";
import type { CardInstance } from "@shared/game-types";
import type { CardTransition } from "./use-card-transitions";

export interface HandAnimationState {
  /** Card instanceIds currently in-flight to/from this hand zone. */
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
  const inFlightInstanceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of transitions) {
      // Cards departing from this hand zone
      if (t.fromZoneKey === zoneKey) {
        if (t.instanceId) {
          ids.add(t.instanceId);
        } else if (t.cardId) {
          // Fallback: match first hand card by cardId
          for (const card of handCards) {
            if (card.cardId === t.cardId) {
              ids.add(card.instanceId);
              break;
            }
          }
        }
      }
      // Cards arriving to this hand zone
      if (t.toZoneKey === zoneKey) {
        if (t.instanceId) {
          ids.add(t.instanceId);
        } else if (t.cardId) {
          // Fallback: match from end (newly-appended cards are last)
          for (let i = handCards.length - 1; i >= 0; i--) {
            if (handCards[i].cardId === t.cardId && !ids.has(handCards[i].instanceId)) {
              ids.add(handCards[i].instanceId);
              break;
            }
          }
        }
      }
    }
    return ids;
  }, [transitions, handCards, zoneKey]);

  const arrivingCount = useMemo(() => {
    let count = 0;
    for (const t of transitions) {
      if (t.toZoneKey === zoneKey) count++;
    }
    return count;
  }, [transitions, zoneKey]);

  const projectedCount = handCards.length + arrivingCount;

  return {
    inFlightInstanceIds,
    projectedCount,
  };
}
