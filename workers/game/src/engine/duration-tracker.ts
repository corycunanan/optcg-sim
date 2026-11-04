import { battleDurationContext } from "./battle-context.js";
/**
 * M4 Duration Tracker
 *
 * Manages the lifecycle of continuous effects:
 * - Creation (via effect resolver)
 * - Persistence (active effects registry)
 * - Expiry (wave-based processing at phase boundaries)
 */

import type {
  RuntimeActiveEffect,
  RuntimeProhibition,
  ExpiryTiming,
  Condition,
  Action,
} from "./effect-types.js";
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
  context?: ExpiryContext,
): GameState {
  const effects = state.activeEffects;
  const remaining = effects.filter(
    (e) => !shouldExpire(e.expiresAt, wave, context)
  );

  if (remaining.length === effects.length) return state;

  return { ...state, activeEffects: remaining };
}

/**
 * Expire battle-scoped effects and prohibitions at End of Battle.
 */
export function expireBattleEffects(state: GameState, battleId: string, seat?: "TURN_PLAYER" | "NON_TURN_PLAYER"): GameState {
  if (seat) {
    const controller = seat === "TURN_PLAYER" ? state.turn.activePlayerIndex : state.turn.activePlayerIndex === 0 ? 1 : 0;
    const due = (expiry: ExpiryTiming) => shouldExpire(expiry, "END_OF_BATTLE", { battleId });
    return { ...state,
      activeEffects: state.activeEffects.filter(effect => effect.controller !== controller || !due(effect.expiresAt)),
      prohibitions: state.prohibitions.filter(prohibition => prohibitionOwner(prohibition) !== controller || !due(prohibition.expiresAt ?? (prohibition.duration.type === "THIS_BATTLE" ? { wave: "END_OF_BATTLE", battleId } : legacyProhibitionExpiry(prohibition.duration, state)))),
    };
  }
  const nextState = expireEffects(state, "END_OF_BATTLE", { battleId });
  return expireProhibitions(nextState, "END_OF_BATTLE", { battleId });
}

/**
 * Every End Phase expiry at once, in rule order (6-6-1-2 steps 1 and 2, then
 * 6-6-1-3). The End Phase itself interleaves these with scheduled obligations
 * (phases.ts); this composite is for callers that model "after the turn".
 */
export function expireEndOfTurnEffects(state: GameState): GameState {
  let nextState = expireUntilEndOfTurn(state, "TURN_PLAYER");
  nextState = expireUntilEndOfTurn(nextState, "NON_TURN_PLAYER");
  return expireDuringThisTurn(nextState);
}

/**
 * Which End Phase expiry clause a turn-bound duration ends under (OPT-924).
 *
 * Card text uses "during this turn" (THIS_TURN), which rule 6-6-1-3 (line
 * 622) invalidates after all of 6-6-1-2. The "until the end of ... turn" and
 * "until the end of ... End Phase" durations are the 6-6-1-2 class (line 617):
 * they end in the step of their controller, after that controller's "at the
 * end of this turn" obligations. Any other or legacy duration that is due at
 * an End Phase wave is treated as "during this turn", the later and more
 * conservative clause.
 */
export type EndPhaseExpiryClause = "UNTIL_END_OF_TURN" | "DURING_THIS_TURN";

export function endPhaseExpiryClause(duration: { type: string } | undefined): EndPhaseExpiryClause {
  switch (duration?.type) {
    case "UNTIL_END_OF_OPPONENT_NEXT_TURN":
    case "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE":
    case "UNTIL_END_OF_YOUR_NEXT_TURN":
      return "UNTIL_END_OF_TURN";
    default:
      return "DURING_THIS_TURN";
  }
}

/**
 * The player who controls the effect behind a prohibition, whose 6-6-1-2 step
 * ends it (OPT-924). Every writer stores that player in `controller` except
 * NEGATE_TRIGGER_TYPE, which stores the affected player there and the owner
 * in `ownerController`. Deterministic fallback for a prohibition saved before
 * `ownerController` existed: a row carrying `scope.triggerType` was written
 * only by NEGATE_TRIGGER_TYPE, and its one authored use (OP09-081) negates
 * the opponent's effects, so its owner is the other player.
 */
export function prohibitionOwner(p: Pick<RuntimeProhibition, "controller" | "ownerController" | "scope">): 0 | 1 {
  if (p.ownerController !== undefined) return p.ownerController;
  if (p.scope?.triggerType !== undefined) return p.controller === 0 ? 1 : 0;
  return p.controller;
}

/** True when an End Phase wave of this turn ends the given expiry. */
function dueThisEndPhase(expiry: ExpiryTiming, context: ExpiryContext): boolean {
  return shouldExpire(expiry, "END_OF_TURN", context) || shouldExpire(expiry, "END_OF_END_PHASE", context);
}

/**
 * Invalidate one player's due End Phase effects and prohibitions of one
 * clause. `seat` is relative to the turn player (rule 6-6-1-2 step 1 is the
 * turn player's, step 2 the non-turn player's; 6-6-1-3 runs turn player then
 * non-turn player).
 */
function expireEndPhaseClause(
  state: GameState,
  clause: EndPhaseExpiryClause,
  seat: "TURN_PLAYER" | "NON_TURN_PLAYER",
): GameState {
  const context = currentTurnContext(state);
  const controller: 0 | 1 = seat === "TURN_PLAYER"
    ? state.turn.activePlayerIndex
    : state.turn.activePlayerIndex === 0 ? 1 : 0;
  const ends = (owner: 0 | 1, duration: { type: string } | undefined, expiry: ExpiryTiming): boolean =>
    owner === controller && endPhaseExpiryClause(duration) === clause && dueThisEndPhase(expiry, context);

  const effects = state.activeEffects.filter((e) => !ends(e.controller, e.duration, e.expiresAt));
  const prohibitions = state.prohibitions.filter(
    (p) => !ends(prohibitionOwner(p), p.duration, p.expiresAt ?? legacyProhibitionExpiry(p.duration, state)),
  );
  const effectsChanged = effects.length !== state.activeEffects.length;
  const prohibitionsChanged = prohibitions.length !== state.prohibitions.length;
  if (!effectsChanged && !prohibitionsChanged) return state;
  return {
    ...state,
    activeEffects: effectsChanged ? effects : state.activeEffects,
    prohibitions: prohibitionsChanged ? prohibitions : state.prohibitions,
  };
}

/**
 * Rule 6-6-1-2 (line 617), the invalidation half of step 1 (`TURN_PLAYER`) or
 * step 2 (`NON_TURN_PLAYER`): that player's "until the end of the turn" and
 * "until the end of the End Phase" effects become invalid.
 */
export function expireUntilEndOfTurn(
  state: GameState,
  seat: "TURN_PLAYER" | "NON_TURN_PLAYER",
): GameState {
  return expireEndPhaseClause(state, "UNTIL_END_OF_TURN", seat);
}

/**
 * Rule 6-6-1-3 (line 622): the turn player's "during this turn" effects
 * become invalid, then the non-turn player's. One-time modifiers scoped to
 * this turn end here too.
 */
export function expireDuringThisTurn(state: GameState): GameState {
  let nextState = expireEndPhaseClause(state, "DURING_THIS_TURN", "TURN_PLAYER");
  nextState = expireEndPhaseClause(nextState, "DURING_THIS_TURN", "NON_TURN_PLAYER");
  nextState = cleanupConsumedOneTimeModifiers(nextState);
  return expireOneTimeModifiers(nextState);
}

/**
 * Expire UNTIL_START_OF_YOUR_NEXT_TURN effects and prohibitions at
 * Refresh Phase (step 1).
 */
export function expireRefreshPhaseEffects(state: GameState): GameState {
  const context = currentTurnContext(state);
  const nextState = expireEffects(state, "REFRESH_PHASE", context);
  return expireProhibitions(nextState, "REFRESH_PHASE", context);
}

/**
 * Expire effects and prohibitions whose source card has left the field.
 */
export function expireSourceLeftZone(
  state: GameState,
  instanceId: string
): GameState {
  const effects = state.activeEffects;
  const remainingEffects = effects.filter((e) => {
    if (e.sourceCardInstanceId !== instanceId) return true;
    // Always remove SOURCE_LEAVES_ZONE effects
    if (e.expiresAt.wave === "SOURCE_LEAVES_ZONE") return false;
    // Also remove permanent-category effects (their source left the field)
    if (e.category === "permanent") return false;
    return true;
  });

  // Also remove permanent prohibitions whose source left the field
  const prohibitions = state.prohibitions;
  const remainingProhibitions = prohibitions.filter((p) => {
    if (p.sourceCardInstanceId !== instanceId) return true;
    if (
      p.duration.type === "PERMANENT" ||
      p.expiresAt?.wave === "SOURCE_LEAVES_ZONE"
    ) {
      return false;
    }
    return true;
  });

  const effectsChanged = remainingEffects.length !== effects.length;
  const prohibitionsChanged = remainingProhibitions.length !== prohibitions.length;

  if (!effectsChanged && !prohibitionsChanged) return state;
  return {
    ...state,
    activeEffects: effectsChanged ? remainingEffects : state.activeEffects,
    prohibitions: prohibitionsChanged
      ? remainingProhibitions
      : state.prohibitions,
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
export function expireTargetLeftZone(
  state: GameState,
  instanceId: string
): GameState {
  const effects = state.activeEffects;
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

  const prohibitions = state.prohibitions;
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
    activeEffects: effectsChanged ? remainingEffects : state.activeEffects,
    prohibitions: prohibitionsChanged
      ? remainingProhibitions
      : state.prohibitions,
  };
}

/**
 * Process scheduled actions for the given timing.
 */
export function processScheduledActions(
  state: GameState,
  timing: string
): {
  state: GameState;
  actionsToRun: Array<{
    action: Action;
    controller: 0 | 1;
    sourceEffectId: string;
    sourceCardSnapshot?: import("../types.js").CardInstance;
    sourceIdentity?: import("../types.js").QueuedSourceSnapshot;
  }>;
} {
  const scheduled = state.scheduledActions;
  const toRun: Array<{
    action: Action;
    controller: 0 | 1;
    sourceEffectId: string;
    sourceCardSnapshot?: import("../types.js").CardInstance;
    sourceIdentity?: import("../types.js").QueuedSourceSnapshot;
  }> = [];
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
        ...(entry.sourceCardSnapshot ? { sourceCardSnapshot: entry.sourceCardSnapshot } : {}),
        ...(entry.sourceIdentity ? { sourceIdentity: entry.sourceIdentity } : {}),
      });
    } else {
      remaining.push(entry);
    }
  }

  return {
    state: { ...state, scheduledActions: remaining },
    actionsToRun: toRun,
  };
}

/**
 * Collect one player's "at the end of this turn" obligations for rule 6-6-1-2
 * (OPT-924). Entries are removed from `state.scheduledActions` in stored
 * order; an entry bound to a card that has left the field is discarded, as
 * `processScheduledActions` does. Each collected entry is tagged with `step`.
 */
export function collectEndOfTurnObligations(
  state: GameState,
  controller: 0 | 1,
  step: "TURN_PLAYER" | "NON_TURN_PLAYER",
): {
  state: GameState;
  entries: Array<{ action: Action; controller: 0 | 1; sourceEffectId: string; sourceCardSnapshot?: import("../types.js").CardInstance;
    sourceIdentity?: import("../types.js").QueuedSourceSnapshot; step: "TURN_PLAYER" | "NON_TURN_PLAYER" }>;
} {
  const entries: Array<{ action: Action; controller: 0 | 1; sourceEffectId: string; sourceCardSnapshot?: import("../types.js").CardInstance;
    sourceIdentity?: import("../types.js").QueuedSourceSnapshot; step: "TURN_PLAYER" | "NON_TURN_PLAYER" }> = [];
  const remaining: typeof state.scheduledActions = [];
  for (const entry of state.scheduledActions) {
    if (entry.timing !== "END_OF_THIS_TURN" || entry.controller !== controller) {
      remaining.push(entry);
      continue;
    }
    if (entry.boundToInstanceId && !findCardOnField(state, entry.boundToInstanceId)) continue;
    entries.push({ action: entry.action, controller: entry.controller, sourceEffectId: entry.sourceEffectId, ...(entry.sourceCardSnapshot ? { sourceCardSnapshot: entry.sourceCardSnapshot } : {}),
        ...(entry.sourceIdentity ? { sourceIdentity: entry.sourceIdentity } : {}), step });
  }
  if (remaining.length === state.scheduledActions.length) return { state, entries };
  return { state: { ...state, scheduledActions: remaining }, entries };
}

/**
 * Expire prohibitions whose duration has elapsed.
 */
export function expireProhibitions(
  state: GameState,
  wave: ExpiryTiming["wave"],
  context?: ExpiryContext,
): GameState {
  const prohibitions = state.prohibitions;
  const remaining = prohibitions.filter((p) => {
    // Prefer the expiry stamped at creation (OPT-408) — "next turn" anchors
    // can't be recomputed at check time. Legacy persisted prohibitions
    // (no expiresAt) keep the old check-time computation.
    const expiry = p.expiresAt ?? legacyProhibitionExpiry(p.duration, state);
    return !shouldExpire(expiry, wave, context);
  });

  if (remaining.length === prohibitions.length) return state;
  return { ...state, prohibitions: remaining };
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
  const effects = state.activeEffects;
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
  return { ...state, activeEffects: remaining };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ExpiryContext {
  turn?: number;
  battleId?: string;
  /** Seat whose turn the wave is firing in. */
  player?: 0 | 1;
  firstPlayerIndex?: 0 | 1;
}

function currentTurnContext(state: GameState): ExpiryContext {
  return {
    turn: state.turn.number,
    player: state.turn.activePlayerIndex,
    firstPlayerIndex: state.turn.firstPlayerIndex ?? 0,
  };
}

/**
 * Linear position of a (round, seat) turn within the game: the first player's
 * turn occupies the even slot of each round. Lets shouldExpire order turns
 * even though both seats share a turn.number (per-round numbering, OPT-366).
 */
function turnSlot(turn: number, player: 0 | 1, firstPlayerIndex: 0 | 1): number {
  return turn * 2 + (player === firstPlayerIndex ? 0 : 1);
}

function shouldExpire(
  expiry: ExpiryTiming,
  wave: ExpiryTiming["wave"],
  context?: ExpiryContext,
): boolean {
  if (expiry.wave !== wave) return false;

  switch (wave) {
    case "END_OF_TURN":
    case "END_OF_END_PHASE":
    case "REFRESH_PHASE": {
      if (!("turn" in expiry) || context?.turn === undefined) return false;
      // Seat-stamped expiries fire at the first wave at-or-after their
      // (turn, seat) slot; seatless ones (THIS_TURN, legacy persisted state)
      // keep the turn-only comparison.
      if (
        expiry.player === undefined ||
        context.player === undefined ||
        context.firstPlayerIndex === undefined
      ) {
        return expiry.turn <= context.turn;
      }
      return (
        turnSlot(context.turn, context.player, context.firstPlayerIndex) >=
        turnSlot(expiry.turn, expiry.player, context.firstPlayerIndex)
      );
    }
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

function legacyProhibitionExpiry(
  duration: import("./effect-types.js").Duration,
  state: GameState,
): ExpiryTiming {
  switch (duration.type) {
    case "THIS_TURN":
      return { wave: "END_OF_TURN", turn: state.turn.number };
    case "THIS_BATTLE":
      return { wave: "END_OF_BATTLE", battleId: battleDurationContext(state) };
    case "PERMANENT":
      return { wave: "SOURCE_LEAVES_ZONE" };
    case "SKIP_NEXT_REFRESH":
      // Consumed by the Refresh Phase it skips (applyRefreshProhibitions),
      // not by an expiry wave — END_OF_TURN would cull it before the
      // opponent's refresh ever happens.
      return { wave: "NEVER" };
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
