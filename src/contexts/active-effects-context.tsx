"use client";

import { createContext, useContext } from "react";
import type { ActiveEffect } from "@shared/game-types";

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

const ActiveEffectsContext = createContext<ActiveEffect[]>([]);

export const ActiveEffectsProvider = ActiveEffectsContext.Provider;

export function useActiveEffects(): ActiveEffect[] {
  return useContext(ActiveEffectsContext);
}

/**
 * Check if power is modified by effects (not just DON).
 * Returns "up" | "down" | null.
 */
export function getPowerModDirection(
  effects: ActiveEffect[],
  instanceId: string,
  basePower: number,
): "up" | "down" | null {
  let power = basePower;
  let hasSetPower = false;
  for (const raw of effects) {
    const effect = raw as unknown as RuntimeEffect;
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
  effects: ActiveEffect[],
  instanceId: string,
  basePower: number,
  donCount: number,
): number {
  let power = basePower;
  for (const raw of effects) {
    const effect = raw as unknown as RuntimeEffect;
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
  effects: ActiveEffect[],
  instanceId: string,
  baseCost: number,
): number {
  let cost = baseCost;
  for (const raw of effects) {
    const effect = raw as unknown as RuntimeEffect;
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
  effects: ActiveEffect[],
  instanceId: string,
): "up" | "down" | null {
  let delta = 0;
  for (const raw of effects) {
    const effect = raw as unknown as RuntimeEffect;
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
