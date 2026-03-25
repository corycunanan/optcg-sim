/**
 * M4 Duration Tracker
 *
 * Manages the lifecycle of continuous effects:
 * - Creation (via effect resolver)
 * - Persistence (active effects registry)
 * - Expiry (wave-based processing at phase boundaries)
 */

import type { RuntimeActiveEffect, ExpiryTiming } from "./effect-types.js";
import type { GameState } from "../types.js";

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
  return expireEffects(state, "END_OF_TURN", { turn: state.turn.number });
}

/**
 * Expire UNTIL_START_OF_YOUR_NEXT_TURN effects at Refresh Phase.
 */
export function expireRefreshPhaseEffects(state: GameState): GameState {
  return expireEffects(state, "REFRESH_PHASE", { turn: state.turn.number });
}

/**
 * Expire effects whose source card has left the field.
 */
export function expireSourceLeftZone(state: GameState, instanceId: string): GameState {
  const effects = state.activeEffects as RuntimeActiveEffect[];
  const remaining = effects.filter((e) =>
    !(e.expiresAt.wave === "SOURCE_LEAVES_ZONE" && e.sourceCardInstanceId === instanceId),
  );

  if (remaining.length === effects.length) return state;
  return { ...state, activeEffects: remaining as any };
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
    if (player.characters.some((c) => c.instanceId === instanceId)) return true;
    if (player.stage?.instanceId === instanceId) return true;
  }
  return false;
}
