/**
 * M4 Duration Tracker
 *
 * Manages the lifecycle of continuous effects:
 * - Creation (via effect resolver)
 * - Persistence (active effects registry)
 * - Expiry (wave-based processing at phase boundaries)
 */

import type { RuntimeActiveEffect, RuntimeProhibition, ExpiryTiming, Condition } from "./effect-types.js";
import type { GameState, CardData } from "../types.js";
import { cleanupConsumedOneTimeModifiers, expireOneTimeModifiers } from "./modifiers.js";
import { evaluateCondition, type ConditionContext } from "./conditions.js";

/**
 * Expire all effects whose duration has elapsed.
 * Called at phase boundaries per rules §6-6-1-2, §6-6-1-3.
 */
export function expireEffects(
  state: GameState,
  wave: ExpiryTiming["wave"],
  context?: { turn?: number; battleId?: string },
): GameState {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const remaining = effects.filter((e) => !shouldExpire(e.expiresAt, wave, context));

  if (remaining.length === effects.length) return state;

  return { ...state, activeEffects: remaining as any };
}

/**
 * Expire battle-scoped effects at End of Battle.
 */
export function expireBattleEffects(state: GameState, battleId: string): GameState {
  return expireEffects(state, "END_OF_BATTLE", { battleId });
}

/**
 * Expire THIS_TURN effects at End Phase.
 * Order: turn player first, then non-turn player (§6-6-1-3).
 */
export function expireEndOfTurnEffects(state: GameState): GameState {
  let nextState = expireEffects(state, "END_OF_TURN", { turn: state.turn.number });
  // Clean up consumed and THIS_TURN one-time modifiers
  nextState = cleanupConsumedOneTimeModifiers(nextState);
  nextState = expireOneTimeModifiers(nextState);
  return nextState;
}

/**
 * Expire UNTIL_START_OF_YOUR_NEXT_TURN effects at Refresh Phase.
 */
export function expireRefreshPhaseEffects(state: GameState): GameState {
  return expireEffects(state, "REFRESH_PHASE", { turn: state.turn.number });
}

/**
 * Expire effects and prohibitions whose source card has left the field.
 */
export function expireSourceLeftZone(state: GameState, instanceId: string): GameState {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const remainingEffects = effects.filter((e) => {
    if (e.sourceCardInstanceId !== instanceId) return true;
    // Always remove SOURCE_LEAVES_ZONE effects
    if (e.expiresAt.wave === "SOURCE_LEAVES_ZONE") return false;
    // Also remove permanent-category effects (their source left the field)
    if (e.category === "permanent") return false;
    return true;
  });

  // Also remove permanent prohibitions whose source left the field
  const prohibitions = state.prohibitions as RuntimeProhibition[];
  const remainingProhibitions = prohibitions.filter((p) => {
    if (p.sourceCardInstanceId !== instanceId) return true;
    if (p.duration.type === "PERMANENT") return false;
    return true;
  });

  const effectsChanged = remainingEffects.length !== effects.length;
  const prohibitionsChanged = remainingProhibitions.length !== prohibitions.length;

  if (!effectsChanged && !prohibitionsChanged) return state;
  return {
    ...state,
    activeEffects: effectsChanged ? remainingEffects as any : state.activeEffects,
    prohibitions: prohibitionsChanged ? remainingProhibitions as any : state.prohibitions,
  };
}

/**
 * OPT-256: Strip a leaving instanceId from every effect/prohibition target list.
 *
 * Why: rules §3-1-6 treats zone transitions as instance-identity boundaries — a
 * re-summoned Character is a fresh object. The new instance gets a fresh
 * instanceId (play.ts:129), so it won't match stale `appliesTo` entries anyway,
 * but explicit strip keeps state clean, prevents unbounded growth across long
 * games, and makes the invariant testable directly on the registries.
 *
 * For AOE entries whose `appliesTo` lists multiple instances we only drop the
 * leaving id; the effect persists for remaining targets. An entry whose
 * `appliesTo` becomes empty is dropped entirely, UNLESS it carries a dynamic
 * (non-SELF) modifier target — dynamic targets re-resolve at read time and
 * should not be killed by an empty static list.
 *
 * Source-bound entries (sourceCardInstanceId === instanceId) are left to
 * expireSourceLeftZone so the two helpers don't step on each other.
 */
export function expireTargetLeftZone(state: GameState, instanceId: string): GameState {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  let effectsChanged = false;
  const remainingEffects: RuntimeActiveEffect[] = [];

  for (const e of effects) {
    if (!e.appliesTo.includes(instanceId) || e.sourceCardInstanceId === instanceId) {
      remainingEffects.push(e);
      continue;
    }

    const filteredAppliesTo = e.appliesTo.filter((id) => id !== instanceId);
    const hasDynamicTarget = (e.modifiers ?? []).some(
      (m) => m.target && m.target.type !== "SELF",
    );

    if (filteredAppliesTo.length === 0 && !hasDynamicTarget) {
      effectsChanged = true;
      continue;
    }

    effectsChanged = true;
    remainingEffects.push({ ...e, appliesTo: filteredAppliesTo });
  }

  const prohibitions = state.prohibitions as RuntimeProhibition[];
  let prohibitionsChanged = false;
  const remainingProhibitions: RuntimeProhibition[] = [];

  for (const p of prohibitions) {
    if (!p.appliesTo.includes(instanceId) || p.sourceCardInstanceId === instanceId) {
      remainingProhibitions.push(p);
      continue;
    }
    const filteredAppliesTo = p.appliesTo.filter((id) => id !== instanceId);
    if (filteredAppliesTo.length === 0) {
      prohibitionsChanged = true;
      continue;
    }
    prohibitionsChanged = true;
    remainingProhibitions.push({ ...p, appliesTo: filteredAppliesTo });
  }

  if (!effectsChanged && !prohibitionsChanged) return state;
  return {
    ...state,
    activeEffects: effectsChanged ? remainingEffects as any : state.activeEffects,
    prohibitions: prohibitionsChanged ? remainingProhibitions as any : state.prohibitions,
  };
}

/**
 * Process scheduled actions for the given timing.
 */
export function processScheduledActions(
  state: GameState,
  timing: string,
): { state: GameState; actionsToRun: Array<{ action: any; controller: 0 | 1; sourceEffectId: string }> } {
  const scheduled = state.scheduledActions as import("./effect-types.js").RuntimeScheduledAction[];
  const toRun: Array<{ action: any; controller: 0 | 1; sourceEffectId: string }> = [];
  const remaining: typeof scheduled = [];

  for (const entry of scheduled) {
    if (entry.timing === timing) {
      // Check if bound card still exists
      if (entry.boundToInstanceId) {
        const exists = findCardOnField(state, entry.boundToInstanceId);
        if (!exists) continue; // Card already left field — discard
      }
      toRun.push({
        action: entry.action,
        controller: entry.controller,
        sourceEffectId: entry.sourceEffectId,
      });
    } else {
      remaining.push(entry);
    }
  }

  return {
    state: { ...state, scheduledActions: remaining as any },
    actionsToRun: toRun,
  };
}

/**
 * Expire prohibitions whose duration has elapsed.
 */
export function expireProhibitions(
  state: GameState,
  wave: ExpiryTiming["wave"],
  context?: { turn?: number; battleId?: string },
): GameState {
  const prohibitions = state.prohibitions as import("./effect-types.js").RuntimeProhibition[];
  const remaining = prohibitions.filter((p) => {
    const expiry = computeProhibitionExpiry(p.duration, state);
    return !shouldExpire(expiry, wave, context);
  });

  if (remaining.length === prohibitions.length) return state;
  return { ...state, prohibitions: remaining as any };
}

/**
 * Re-evaluate all WHILE_CONDITION effects.
 *
 * Permanent-category effects are never removed here — their condition is
 * checked at modifier-application time (getEffectivePower, hasGrantedKeyword,
 * etc.) so they toggle on/off each turn without being destroyed.
 * They are cleaned up only when their source card leaves the field
 * (via expireSourceLeftZone).
 *
 * Non-permanent WHILE_CONDITION effects (e.g., from resolved actions) are
 * still removed when their condition becomes false.
 */
export function evaluateWhileConditions(
  state: GameState,
  cardDb: Map<string, CardData>,
): GameState {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const remaining = effects.filter((e) => {
    if (e.expiresAt.wave !== "CONDITION_FALSE") return true;

    // Permanent effects are never removed by condition evaluation —
    // their condition is checked inline when modifiers are applied.
    if (e.category === "permanent") return true;

    // Extract the condition from the duration
    const duration = e.duration as { type: string; condition?: Condition };
    if (duration.type !== "WHILE_CONDITION" || !duration.condition) return true;

    // Evaluate the condition
    const condCtx: ConditionContext = {
      sourceCardInstanceId: e.sourceCardInstanceId,
      controller: e.controller,
      cardDb,
    };

    return evaluateCondition(state, duration.condition, condCtx);
  });

  if (remaining.length === effects.length) return state;
  return { ...state, activeEffects: remaining as any };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shouldExpire(
  expiry: ExpiryTiming,
  wave: ExpiryTiming["wave"],
  context?: { turn?: number; battleId?: string },
): boolean {
  if (expiry.wave !== wave) return false;

  switch (wave) {
    case "END_OF_TURN":
    case "END_OF_END_PHASE":
    case "REFRESH_PHASE":
      return "turn" in expiry && context?.turn !== undefined && expiry.turn <= context.turn;
    case "END_OF_BATTLE":
      return "battleId" in expiry && context?.battleId !== undefined && expiry.battleId === context.battleId;
    case "SOURCE_LEAVES_ZONE":
      return true; // checked externally
    case "CONDITION_FALSE":
      return true; // rechecked at step 6
    case "NEVER":
      return false;
    default:
      return false;
  }
}

function computeProhibitionExpiry(
  duration: import("./effect-types.js").Duration,
  state: GameState,
): ExpiryTiming {
  switch (duration.type) {
    case "THIS_TURN":
      return { wave: "END_OF_TURN", turn: state.turn.number };
    case "THIS_BATTLE":
      return { wave: "END_OF_BATTLE", battleId: state.turn.battle?.battleId ?? "" };
    case "PERMANENT":
      return { wave: "SOURCE_LEAVES_ZONE" };
    default:
      return { wave: "END_OF_TURN", turn: state.turn.number };
  }
}

function findCardOnField(state: GameState, instanceId: string): boolean {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return true;
    if (player.characters.some((c) => c?.instanceId === instanceId)) return true;
    if (player.stage?.instanceId === instanceId) return true;
  }
  return false;
}
