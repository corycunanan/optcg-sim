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

export function computeHandAnimationState(
  transitions: readonly CardTransition[],
  handCards: readonly CardInstance[],
  zoneKey: string,
): HandAnimationState {
  const inFlightInstanceIds = new Set<string>();
  let arrivingCount = 0;

  for (const transition of transitions) {
    const touchesHand =
      transition.fromZoneKey === zoneKey || transition.toZoneKey === zoneKey;
    if (!touchesHand) continue;

    if (transition.toZoneKey === zoneKey) arrivingCount += 1;

    if (transition.instanceId) {
      inFlightInstanceIds.add(transition.instanceId);
      continue;
    }

    if (!transition.cardId) continue;
    const matchingCards =
      transition.toZoneKey === zoneKey ? [...handCards].reverse() : handCards;
    const fallbackCard = matchingCards.find(
      (card) =>
        card.cardId === transition.cardId &&
        !inFlightInstanceIds.has(card.instanceId),
    );
    if (fallbackCard) inFlightInstanceIds.add(fallbackCard.instanceId);
  }

  return {
    inFlightInstanceIds,
    projectedCount: handCards.length + arrivingCount,
  };
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
  return useMemo(
    () => computeHandAnimationState(transitions, handCards, zoneKey),
    [transitions, handCards, zoneKey],
  );
}
