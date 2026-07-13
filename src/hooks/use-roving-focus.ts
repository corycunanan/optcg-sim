"use client";

import { useCallback, useRef, useState } from "react";

const ROVING_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
]);

/** Resolve the next tab stop for a one-dimensional card collection. Arrow
 * keys wrap so a player can scan the entire collection without returning to
 * Tab; Home/End jump to its boundaries. */
export function getNextRovingId(
  itemIds: readonly string[],
  currentId: string | null,
  key: string,
): string | null {
  if (itemIds.length === 0 || !ROVING_KEYS.has(key)) return currentId;
  if (key === "Home") return itemIds[0];
  if (key === "End") return itemIds.at(-1) ?? null;

  const currentIndex = Math.max(0, itemIds.indexOf(currentId ?? ""));
  const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return itemIds[(currentIndex + delta + itemIds.length) % itemIds.length];
}

/** Roving-tabindex behavior shared by card grids. Disabled cards deliberately
 * remain in the arrow-key sequence so their aria-describedby explanation is
 * reachable to screen-reader and keyboard users. */
export function useRovingFocus<T extends HTMLElement>(itemIds: readonly string[]) {
  const [requestedTabStopId, setRequestedTabStopId] = useState<string | null>(
    itemIds[0] ?? null,
  );
  const itemRefs = useRef(new Map<string, T>());
  const tabStopId = itemIds.includes(requestedTabStopId ?? "")
    ? requestedTabStopId
    : (itemIds[0] ?? null);

  const setItemRef = useCallback((id: string, node: T | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const onFocus = useCallback((id: string) => {
    setRequestedTabStopId(id);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<T>, id: string) => {
      const nextId = getNextRovingId(itemIds, id, event.key);
      if (!nextId || nextId === id || !ROVING_KEYS.has(event.key)) return;
      event.preventDefault();
      setRequestedTabStopId(nextId);
      itemRefs.current.get(nextId)?.focus();
    },
    [itemIds],
  );

  return {
    getTabIndex: (id: string) => (id === tabStopId ? 0 : -1),
    onFocus,
    onKeyDown,
    setItemRef,
  };
}
