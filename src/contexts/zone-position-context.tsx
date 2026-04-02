"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";

interface ZonePositionRegistry {
  register(zoneKey: string, element: HTMLElement): void;
  unregister(zoneKey: string): void;
  getRect(zoneKey: string): DOMRect | null;
}

const ZonePositionContext = createContext<ZonePositionRegistry | null>(null);

export function ZonePositionProvider({ children }: { children: ReactNode }) {
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const register = useCallback((zoneKey: string, element: HTMLElement) => {
    elementsRef.current.set(zoneKey, element);
  }, []);

  const unregister = useCallback((zoneKey: string) => {
    elementsRef.current.delete(zoneKey);
  }, []);

  const getRect = useCallback((zoneKey: string): DOMRect | null => {
    const el = elementsRef.current.get(zoneKey);
    return el ? el.getBoundingClientRect() : null;
  }, []);

  const registry = useRef<ZonePositionRegistry>({ register, unregister, getRect });

  return (
    <ZonePositionContext.Provider value={registry.current}>
      {children}
    </ZonePositionContext.Provider>
  );
}

export function useZonePosition(): ZonePositionRegistry {
  const ctx = useContext(ZonePositionContext);
  if (!ctx) throw new Error("useZonePosition must be used within ZonePositionProvider");
  return ctx;
}
