"use client";

import { useCallback, useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { CardInstance } from "@shared/game-types";

/**
 * Pure merge: produce the effective ordered hand from a user-preferred
 * sequence of instanceIds and the server's authoritative hand.
 *
 * - IDs in `customOrder` that match a server card keep their relative order.
 * - Server cards missing from `customOrder` append in server order.
 * - IDs in `customOrder` that no longer exist on the server are dropped.
 *
 * Exposed for unit tests — the React hook below consumes this via useMemo.
 */
export function mergeHandOrder(
  customOrder: readonly string[],
  hand: readonly CardInstance[]
): CardInstance[] {
  const byId = new Map(hand.map((c) => [c.instanceId, c]));
  const seen = new Set<string>();
  const result: CardInstance[] = [];
  for (const id of customOrder) {
    const card = byId.get(id);
    if (card && !seen.has(id)) {
      result.push(card);
      seen.add(id);
    }
  }
  for (const card of hand) {
    if (!seen.has(card.instanceId)) result.push(card);
  }
  return result;
}

/**
 * Compute the next customOrder array after a sortable reorder event.
 * Prunes stale IDs, appends any new server IDs not yet in the order, then
 * runs arrayMove on the active → over pair. Returns `null` if the move is
 * a no-op (either id missing or same index).
 *
 * Exposed for unit tests.
 */
export function computeReorderedCustomOrder(
  prev: readonly string[],
  hand: readonly CardInstance[],
  activeId: string,
  overId: string
): string[] | null {
  const byId = new Map(hand.map((c) => [c.instanceId, c]));
  const seen = new Set<string>();
  const effective: string[] = [];
  for (const id of prev) {
    if (byId.has(id) && !seen.has(id)) {
      effective.push(id);
      seen.add(id);
    }
  }
  for (const card of hand) {
    if (!seen.has(card.instanceId)) effective.push(card.instanceId);
  }
  const oldIndex = effective.indexOf(activeId);
  const newIndex = effective.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
  return arrayMove(effective, oldIndex, newIndex);
}

/**
 * Keeps a user-preferred hand order on top of the server's authoritative hand.
 * Server order changes (draws, plays, discards) merge into the local order:
 * removed cards drop out, new cards append at the tail, and the player's
 * custom sequence for surviving cards is preserved.
 */
export function useHandOrder(hand: CardInstance[]) {
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  const orderedHand = useMemo(
    () => orderHandFromReceivedState(customOrder, hand),
    [hand, customOrder]
  );

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      setCustomOrder((prev) => {
        const next = computeReorderedCustomOrder(prev, hand, activeId, overId);
        return next ?? prev;
      });
    },
    [hand]
  );

  return { orderedHand, reorder };
}

/**
 * Preserve existing face-down opponent cards while inserting newly observed
 * placeholders at non-authoritative visual positions. This prevents a public
 * reveal returning to hand from remaining trackable at the server's append
 * position. The engine order remains untouched.
 */
export function mergeHiddenHandOrder(
  previousOrder: readonly string[],
  hand: readonly CardInstance[],
  random: () => number = Math.random
): CardInstance[] {
  const byId = new Map(hand.map((card) => [card.instanceId, card]));
  const orderedIds = previousOrder.filter((id) => byId.has(id));
  const known = new Set(orderedIds);

  for (const card of hand) {
    if (known.has(card.instanceId)) continue;
    const index = Math.floor(random() * (orderedIds.length + 1));
    orderedIds.splice(index, 0, card.instanceId);
    known.add(card.instanceId);
  }

  return orderedIds
    .map((id) => byId.get(id))
    .filter((card): card is CardInstance => card !== undefined);
}

function hiddenVisualScore(instanceId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < instanceId.length; index += 1) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderFullyHiddenHand(hand: readonly CardInstance[]): CardInstance[] {
  let cardIndex = 0;
  return mergeHiddenHandOrder([], hand, () => {
    const card = hand[cardIndex++];
    return card ? hiddenVisualScore(card.instanceId) / 0x1_0000_0000 : 0;
  });
}

/**
 * Selects the visual ordering policy from the received identities themselves.
 * A fully redacted hand gets privacy-safe placeholder ordering. Any real card
 * identity keeps authoritative/custom ordering, including spectator hands and
 * defensive mixed projections.
 */
export function orderHandFromReceivedState(
  customOrder: readonly string[],
  hand: readonly CardInstance[],
): CardInstance[] {
  const fullyHidden =
    hand.length > 0 && hand.every((card) => card.cardId === "hidden");
  return fullyHidden
    ? orderFullyHiddenHand(hand)
    : mergeHandOrder(customOrder, hand);
}

/**
 * Client-only visual order for an opponent's fully hidden hand. Sorting by a
 * hash of zone-local placeholder IDs gives each new card a stable,
 * non-authoritative insertion point without retaining secret engine order.
 */
export function useHiddenHandOrder(hand: CardInstance[]) {
  return useMemo(() => orderFullyHiddenHand(hand), [hand]);
}
