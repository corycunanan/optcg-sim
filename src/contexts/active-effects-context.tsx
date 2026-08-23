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
  params?: Record<string, unknown>;
}

export interface RuntimeEffect {
  id: string;
  sourceCardInstanceId: string;
  modifiers?: RuntimeModifier[];
  appliesTo?: string[];
}

const RuntimeModifierSchema = z
  .object({
    type: z.string(),
    // Engine-authored modifiers may carry numeric or dynamic values such as
    // `{ type: "PER_COUNT", ... }`. Preserve the payload here and narrow only
    // where the display calculation actually consumes a numeric value.
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const RuntimeEffectEnvelopeSchema = z
  .object({
    id: z.string(),
    sourceCardInstanceId: z.string(),
    modifiers: z.array(z.unknown()).optional(),
    appliesTo: z.array(z.string()).optional(),
  })
  .passthrough();

function parseRuntimeEffects(effects: ActiveEffect[]): RuntimeEffect[] {
  return effects.flatMap((effect) => {
    const parsedEffect = RuntimeEffectEnvelopeSchema.safeParse(effect);
    if (!parsedEffect.success) return [];

    const modifiers = (parsedEffect.data.modifiers ?? []).flatMap(
      (modifier) => {
        const parsedModifier = RuntimeModifierSchema.safeParse(modifier);
        return parsedModifier.success ? [parsedModifier.data] : [];
      }
    );

    return [{ ...parsedEffect.data, modifiers }];
  });
}

const ActiveEffectsContext = createContext<RuntimeEffect[]>([]);

export function ActiveEffectsProvider({
  value,
  children,
}: {
  value: ActiveEffect[];
  children: ReactNode;
}) {
  return (
    <ActiveEffectsContext.Provider value={parseRuntimeEffects(value)}>
      {children}
    </ActiveEffectsContext.Provider>
  );
}

export function useActiveEffects(): RuntimeEffect[] {
  return useContext(ActiveEffectsContext);
}

/** Legacy snapshot fallback for power direction when canonical power is absent. */
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
      if (mod.type === "SET_POWER" && typeof mod.params?.value === "number") {
        power = mod.params.value;
        hasSetPower = true;
      }
      if (
        mod.type === "MODIFY_POWER" &&
        typeof mod.params?.amount === "number"
      ) {
        power += mod.params.amount;
      }
    }
  }
  if (!hasSetPower && power === basePower) return null;
  return power > basePower ? "up" : power < basePower ? "down" : null;
}

/** Legacy snapshot fallback for effective power when canonical power is absent. */
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
      if (mod.type === "SET_POWER" && typeof mod.params?.value === "number") {
        power = mod.params.value;
      }
      if (
        mod.type === "MODIFY_POWER" &&
        typeof mod.params?.amount === "number"
      ) {
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
      if (
        mod.type === "MODIFY_COST" &&
        typeof mod.params?.amount === "number"
      ) {
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
      if (
        mod.type === "MODIFY_COST" &&
        typeof mod.params?.amount === "number"
      ) {
        delta += mod.params.amount;
      }
    }
  }
  if (delta === 0) return null;
  return delta > 0 ? "up" : "down";
}
