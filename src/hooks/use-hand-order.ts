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
  hand: readonly CardInstance[],
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
  overId: string,
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
    () => mergeHandOrder(customOrder, hand),
    [hand, customOrder],
  );

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      setCustomOrder((prev) => {
        const next = computeReorderedCustomOrder(prev, hand, activeId, overId);
        return next ?? prev;
      });
    },
    [hand],
  );

  return { orderedHand, reorder };
}
