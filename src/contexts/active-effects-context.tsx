"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ActiveEffect } from "@shared/game-types";
import { z } from "zod";

/**
 * Runtime shape of ActiveEffect as serialized from the game worker.
 * The shared type is a stub; this reflects what actually arrives over the wire.
 */
export interface RuntimeModifier {
  type: string;
  params?: { amount?: number; value?: number };
}

export interface RuntimeEffect {
  id: string;
  sourceCardInstanceId: string;
  modifiers?: RuntimeModifier[];
  appliesTo?: string[];
}

const RuntimeEffectSchema = z.object({
  id: z.string(),
  sourceCardInstanceId: z.string(),
  modifiers: z
    .array(
      z.object({
        type: z.string(),
        params: z
          .object({
            amount: z.number().optional(),
            value: z.number().optional(),
          })
          .optional(),
      })
    )
    .optional(),
  appliesTo: z.array(z.string()).optional(),
});

const ActiveEffectsContext = createContext<RuntimeEffect[]>([]);

export function ActiveEffectsProvider({
  value,
  children,
}: {
  value: ActiveEffect[];
  children: ReactNode;
}) {
  const parsed = z.array(RuntimeEffectSchema).safeParse(value);
  return (
    <ActiveEffectsContext.Provider value={parsed.success ? parsed.data : []}>
      {children}
    </ActiveEffectsContext.Provider>
  );
}

export function useActiveEffects(): RuntimeEffect[] {
  return useContext(ActiveEffectsContext);
}

/**
 * Check if power is modified by effects (not just DON).
 * Returns "up" | "down" | null.
 */
export function getPowerModDirection(
  effects: RuntimeEffect[],
  instanceId: string,
  basePower: number
): "up" | "down" | null {
  let power = basePower;
  let hasSetPower = false;
  for (const effect of effects) {
    if (!effect.appliesTo?.includes(instanceId)) continue;
    for (const mod of effect.modifiers ?? []) {
      if (mod.type === "SET_POWER" && mod.params?.value !== undefined) {
        power = mod.params.value;
        hasSetPower = true;
      }
      if (mod.type === "MODIFY_POWER" && mod.params?.amount !== undefined) {
        power += mod.params.amount;
      }
    }
  }
  if (!hasSetPower && power === basePower) return null;
  return power > basePower ? "up" : power < basePower ? "down" : null;
}

/**
 * Compute effective power including DON bonus and effect modifications.
 * Mirrors the server-side getEffectivePower logic.
 */
export function computeEffectivePower(
  effects: RuntimeEffect[],
  instanceId: string,
  basePower: number,
  donCount: number
): number {
  let power = basePower;
  for (const effect of effects) {
    if (!effect.appliesTo?.includes(instanceId)) continue;
    for (const mod of effect.modifiers ?? []) {
      if (mod.type === "SET_POWER" && mod.params?.value !== undefined) {
        power = mod.params.value;
      }
      if (mod.type === "MODIFY_POWER" && mod.params?.amount !== undefined) {
        power += mod.params.amount;
      }
    }
  }
  // DON bonus is always additive on top
  power += donCount * 1000;
  return power;
}

/**
 * Compute effective cost including effect modifications.
 */
export function computeEffectiveCost(
  effects: RuntimeEffect[],
  instanceId: string,
  baseCost: number
): number {
  let cost = baseCost;
  for (const effect of effects) {
    if (!effect.appliesTo?.includes(instanceId)) continue;
    for (const mod of effect.modifiers ?? []) {
      if (mod.type === "MODIFY_COST" && mod.params?.amount !== undefined) {
        cost += mod.params.amount;
      }
    }
  }
  return Math.max(0, cost);
}

/**
 * Compute effective cost delta from active effects.
 * Returns "up" | "down" | null.
 */
export function getCostModDirection(
  effects: RuntimeEffect[],
  instanceId: string
): "up" | "down" | null {
  let delta = 0;
  for (const effect of effects) {
    if (!effect.appliesTo?.includes(instanceId)) continue;
    for (const mod of effect.modifiers ?? []) {
      if (mod.type === "MODIFY_COST" && mod.params?.amount !== undefined) {
        delta += mod.params.amount;
      }
    }
  }
  if (delta === 0) return null;
  return delta > 0 ? "up" : "down";
}
