"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface ZonePositionRegistry {
  register(zoneKey: string, element: HTMLElement): void;
  unregister(zoneKey: string): void;
  getRect(zoneKey: string): DOMRect | null;
  /** Track which card instance lives in which zone. */
  registerCard(instanceId: string, zoneKey: string): void;
  unregisterCard(instanceId: string): void;
  /** Look up the zone key for a card instance. */
  getCardZone(instanceId: string): string | null;
}

const ZonePositionContext = createContext<ZonePositionRegistry | null>(null);
const MAX_POSITION_HISTORY = 64;

function rememberLatest<T>(history: Map<string, T>, key: string, value: T) {
  // Refresh insertion order when an existing card moves so eviction remains
  // least-recently-recorded rather than first-ever-recorded.
  history.delete(key);
  history.set(key, value);
  if (history.size > MAX_POSITION_HISTORY) {
    const oldestKey = history.keys().next().value;
    if (oldestKey) history.delete(oldestKey);
  }
}

export function ZonePositionProvider({ children }: { children: ReactNode }) {
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const cardZonesRef = useRef<Map<string, string>>(new Map());
  // Zone-changing events arrive in the same React update that removes the
  // source card from the board. Preserve its last registered zone so the
  // transition layer can still dissolve/launch from the real source slot
  // after the source element unmounts.
  const previousCardZonesRef = useRef<Map<string, string>>(new Map());

  const register = useCallback((zoneKey: string, element: HTMLElement) => {
    elementsRef.current.set(zoneKey, element);
  }, []);

  const unregister = useCallback((zoneKey: string) => {
    const element = elementsRef.current.get(zoneKey);
    if (element) {
      rememberLatest(previousRectsRef.current, zoneKey, element.getBoundingClientRect());
    }
    elementsRef.current.delete(zoneKey);
  }, []);

  const getRect = useCallback((zoneKey: string): DOMRect | null => {
    const el = elementsRef.current.get(zoneKey);
    return el
      ? el.getBoundingClientRect()
      : (previousRectsRef.current.get(zoneKey) ?? null);
  }, []);

  const registerCard = useCallback((instanceId: string, zoneKey: string) => {
    cardZonesRef.current.set(instanceId, zoneKey);
    rememberLatest(previousCardZonesRef.current, instanceId, zoneKey);
  }, []);

  const unregisterCard = useCallback((instanceId: string) => {
    cardZonesRef.current.delete(instanceId);
  }, []);

  const getCardZone = useCallback((instanceId: string): string | null => {
    return (
      cardZonesRef.current.get(instanceId) ??
      previousCardZonesRef.current.get(instanceId) ??
      null
    );
  }, []);

  const registry = useMemo<ZonePositionRegistry>(() => ({
    register,
    unregister,
    getRect,
    registerCard,
    unregisterCard,
    getCardZone,
  }), [register, unregister, getRect, registerCard, unregisterCard, getCardZone]);

  return (
    <ZonePositionContext.Provider value={registry}>
      {children}
    </ZonePositionContext.Provider>
  );
}

export function useZonePosition(): ZonePositionRegistry {
  const ctx = useContext(ZonePositionContext);
  if (!ctx) throw new Error("useZonePosition must be used within ZonePositionProvider");
  return ctx;
}
