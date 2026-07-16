"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { EffectAvailability } from "@shared/game-types";

interface EffectAvailabilityContextValue {
  /** Availability entries for a card instance; [] when the server sent none. */
  getCardAvailability(instanceId: string): EffectAvailability[];
  /** Availability for one block; null when the server emitted no entry. */
  getEffectStatus(
    instanceId: string,
    effectId: string
  ): EffectAvailability | null;
  /** Whether the card has at least one usable effect. */
  hasUsableEffect(instanceId: string): boolean;
}

const EMPTY_AVAILABILITY: EffectAvailability[] = [];

const EffectAvailabilityContext = createContext<EffectAvailabilityContextValue>(
  {
    getCardAvailability: () => EMPTY_AVAILABILITY,
    getEffectStatus: () => null,
    hasUsableEffect: () => false,
  }
);

export function EffectAvailabilityProvider({
  effectAvailability,
  children,
}: {
  effectAvailability: Record<string, EffectAvailability[]> | undefined;
  children: ReactNode;
}) {
  const getCardAvailability = useCallback(
    (instanceId: string) =>
      effectAvailability?.[instanceId] ?? EMPTY_AVAILABILITY,
    [effectAvailability]
  );

  const getEffectStatus = useCallback(
    (instanceId: string, effectId: string) =>
      getCardAvailability(instanceId).find(
        (availability) => availability.effectId === effectId
      ) ?? null,
    [getCardAvailability]
  );

  const hasUsableEffect = useCallback(
    (instanceId: string) =>
      getCardAvailability(instanceId).some(
        (availability) => availability.status === "usable"
      ),
    [getCardAvailability]
  );

  const value = useMemo(
    () => ({
      getCardAvailability,
      getEffectStatus,
      hasUsableEffect,
    }),
    [getCardAvailability, getEffectStatus, hasUsableEffect]
  );

  return (
    <EffectAvailabilityContext.Provider value={value}>
      {children}
    </EffectAvailabilityContext.Provider>
  );
}

export function useEffectAvailability(): EffectAvailabilityContextValue {
  return useContext(EffectAvailabilityContext);
}
