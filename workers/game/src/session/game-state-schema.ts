/**
 * Game-state schema version, frame-kind contract, continuation-reference
 * integrity, and legacy-shape classification (OPT-940).
 *
 * Contract of record: docs/game-engine/SAVED-STATE-COMPATIBILITY.md.
 *
 * Three independent versions exist at the storage boundary:
 *   - SESSION_STORAGE_FORMAT_VERSION (persistence.ts): how one session is
 *     split across Durable Object keys.
 *   - executionContext.version (execution-context.ts): the RNG / id / clock
 *     algorithm.
 *   - GAME_STATE_SCHEMA_VERSION (here): the shape and semantics of GameState
 *     itself, carried by the `schemaVersion` key on every persisted
 *     game-state object (live state and each undo snapshot).
 *
 * A persisted game-state object without `schemaVersion` is version 1. That
 * assignment is permanent: absent never means "latest".
 *
 * Writers do not emit `schemaVersion` yet. The first writer to emit it is the
 * first PR that bumps the version to 2, after this reader is deployed.
 */

import type { EffectStackFrame, GameState } from "../types.js";
import { log } from "../lib/log.js";

export const GAME_STATE_SCHEMA_VERSION = 1;
export const GAME_STATE_SCHEMA_VERSION_KEY = "schemaVersion";
/** Versions this build can read. Retiring one follows the support-window policy (§3). */
export const SUPPORTED_GAME_STATE_SCHEMA_VERSIONS: readonly number[] = [1];
/** The version assigned to a persisted game-state object with no `schemaVersion` key. */
export const LEGACY_GAME_STATE_SCHEMA_VERSION = 1;

export const EFFECT_STACK_FRAME_KINDS = [
  "EFFECT",
  "COST",
  "TRIGGER_ORDER",
  "TRIGGER_DRAIN",
  "BATCH_RESUME",
  "PHASE_BOUNDARY",
] as const;
export type EffectStackFrameKind = (typeof EFFECT_STACK_FRAME_KINDS)[number];

/**
 * Legacy shapes the reader loads unchanged and reports. Each has a recorded
 * disposition and owner in SAVED-STATE-COMPATIBILITY.md §4.
 */
export type LegacyShape =
  | "legacy.stage_less_phase_boundary"
  | "legacy.structural_resume_context"
  | "legacy.cost_transaction_frame"
  | "legacy.stuck_damage_step";

/**
 * A session failed to load. `location` is `state` or `undoHistory[i]`;
 * `reason` names the field or reference. Storage is never written during a
 * load, so the three stored values are untouched when this is thrown.
 */
export class SessionLoadError extends Error {
  constructor(
    readonly location: string,
    readonly reason: string
  ) {
    super(`Stored session ${location} ${reason}`);
    this.name = "SessionLoadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the game-state schema version of a raw persisted object. Absent means
 * the legacy version. Anything that is not a positive integer, or an integer
 * this build does not support, rejects the load.
 */
export function readGameStateSchemaVersion(
  raw: Record<string, unknown>,
  location: string
): number {
  const stored = raw[GAME_STATE_SCHEMA_VERSION_KEY];
  if (stored === undefined) return LEGACY_GAME_STATE_SCHEMA_VERSION;
  if (typeof stored !== "number" || !Number.isInteger(stored) || stored < 1) {
    throw new SessionLoadError(
      location,
      `has an invalid game-state schema version ${JSON.stringify(stored)}; supported versions: ${SUPPORTED_GAME_STATE_SCHEMA_VERSIONS.join(", ")}`
    );
  }
  if (!SUPPORTED_GAME_STATE_SCHEMA_VERSIONS.includes(stored)) {
    const newer = stored > GAME_STATE_SCHEMA_VERSION;
    throw new SessionLoadError(
      location,
      `has unsupported game-state schema version ${stored} (${newer ? "written by a newer build; roll forward to a build that reads it" : "retired; see the support window in docs/game-engine/SAVED-STATE-COMPATIBILITY.md"}); this build supports ${SUPPORTED_GAME_STATE_SCHEMA_VERSIONS.join(", ")}`
    );
  }
  return stored;
}

type Converter = (raw: Record<string, unknown>, location: string) => Record<string, unknown>;

/**
 * Version 1 is the current runtime shape. The converter only removes the
 * envelope key; it never drops an unknown field (strict validation rejects
 * those afterwards so corruption cannot pass as compatibility).
 */
const convertFromV1: Converter = (raw) => {
  if (!(GAME_STATE_SCHEMA_VERSION_KEY in raw)) return raw;
  const rest: Record<string, unknown> = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  return rest;
};

const CONVERTERS: Record<number, Converter> = {
  1: convertFromV1,
};

/**
 * Convert a raw persisted game-state object of a recognized version into the
 * current runtime shape, before strict validation. The caller strictly
 * validates the result and then calls `validateContinuationReferences`.
 */
export function convertToCurrentShape(
  raw: unknown,
  location: string
): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new SessionLoadError(location, "must be an object");
  }
  const version = readGameStateSchemaVersion(raw, location);
  const converter = CONVERTERS[version];
  if (!converter) {
    throw new SessionLoadError(
      location,
      `has game-state schema version ${version} with no converter registered`
    );
  }
  return converter(raw, location);
}

/**
 * The single definition of a frame's kind, derived from its content. A
 * persisted `kind` must agree with this projection.
 */
export function frameKindOf(
  frame: Pick<EffectStackFrame, "phase" | "phaseBoundaryContinuation">
): EffectStackFrameKind {
  if (frame.phaseBoundaryContinuation) return "PHASE_BOUNDARY";
  switch (frame.phase) {
    case "AWAITING_COST_SELECTION":
      return "COST";
    case "AWAITING_TRIGGER_ORDER_SELECTION":
      return "TRIGGER_ORDER";
    case "AWAITING_BATCH_RESUME":
      return "BATCH_RESUME";
    case "INTERRUPTED_BY_TRIGGERS":
      return "TRIGGER_DRAIN";
    default:
      return "EFFECT";
  }
}

function frameInvariantViolation(
  frame: EffectStackFrame,
  kind: EffectStackFrameKind,
  state: GameState
): string | null {
  switch (kind) {
    case "PHASE_BOUNDARY": {
      const continuation = frame.phaseBoundaryContinuation!;
      if (frame.phase !== "INTERRUPTED_BY_TRIGGERS") {
        return `is PHASE_BOUNDARY but has phase ${frame.phase}`;
      }
      if (frame.batchResumeMarker || frame.triggerOrderingGroup || frame.costs.length > 0) {
        return "is PHASE_BOUNDARY but carries batch, ordering, or cost state";
      }
      if (continuation.kind !== "END_PHASE") {
        return `has phaseBoundaryContinuation.kind ${String(continuation.kind)}; expected END_PHASE`;
      }
      if (state.turn.phase !== "END") {
        return `parks an End Phase while turn.phase is ${state.turn.phase}`;
      }
      if (continuation.endingPlayerIndex !== state.turn.activePlayerIndex) {
        return `has phaseBoundaryContinuation.endingPlayerIndex ${continuation.endingPlayerIndex} but turn.activePlayerIndex is ${state.turn.activePlayerIndex}`;
      }
      return null;
    }
    case "COST":
      return frame.costs.length === 0 ? "is COST but has no costs" : null;
    case "BATCH_RESUME":
      return frame.batchResumeMarker ? null : "is BATCH_RESUME but has no batchResumeMarker";
    case "TRIGGER_ORDER":
    case "TRIGGER_DRAIN":
    case "EFFECT":
      return null;
  }
}

/**
 * Validate every prompt/frame reference and the semantic invariants of the
 * converted state (SAVED-STATE-COMPATIBILITY.md §2.3, §2.4). Throws
 * SessionLoadError naming the reference; never mutates.
 */
export function validateContinuationReferences(
  state: GameState,
  location: string
): void {
  const frames = state.effectStack;
  const frameIds = new Map<string, EffectStackFrame>();
  frames.forEach((frame, index) => {
    const ref = `effectStack[${index}]`;
    if (frameIds.has(frame.id)) {
      throw new SessionLoadError(location, `${ref} repeats frame id ${JSON.stringify(frame.id)}`);
    }
    frameIds.set(frame.id, frame);

    const derived = frameKindOf(frame);
    if (frame.kind !== undefined && frame.kind !== derived) {
      throw new SessionLoadError(
        location,
        `${ref} (frame ${JSON.stringify(frame.id)}) declares kind ${frame.kind} but its content is ${derived}`
      );
    }
    const violation = frameInvariantViolation(frame, derived, state);
    if (violation) {
      throw new SessionLoadError(location, `${ref} (frame ${JSON.stringify(frame.id)}) ${violation}`);
    }

    const group = frame.triggerOrderingGroup;
    if (group) {
      const known = new Set(
        group.triggers
          .map((trigger) => trigger.orderingId)
          .filter((id): id is string => typeof id === "string")
      );
      group.resolvedTriggerIds.forEach((id, resolvedIndex) => {
        if (!known.has(id)) {
          throw new SessionLoadError(
            location,
            `${ref}.triggerOrderingGroup.resolvedTriggerIds[${resolvedIndex}] names ${JSON.stringify(id)}, which is not a trigger in that group`
          );
        }
      });
    }
  });

  const prompt = state.pendingPrompt;
  if (prompt && typeof prompt.resumeContext === "string") {
    const ref = "pendingPrompt.resumeContext";
    const target = frameIds.get(prompt.resumeContext);
    if (!target) {
      throw new SessionLoadError(
        location,
        `${ref} names frame ${JSON.stringify(prompt.resumeContext)}, which is not on the effect stack (${frames.length} frame${frames.length === 1 ? "" : "s"})`
      );
    }
    const kind = frameKindOf(target);
    if (kind === "PHASE_BOUNDARY") {
      throw new SessionLoadError(
        location,
        `${ref} names frame ${JSON.stringify(prompt.resumeContext)}, a PHASE_BOUNDARY frame that cannot own a prompt`
      );
    }
  }

  const { turn } = state;
  const continuation = turn.pendingBattleDamageContinuation;
  if (continuation) {
    if (!turn.battle) {
      throw new SessionLoadError(
        location,
        `turn.pendingBattleDamageContinuation refers to battle ${JSON.stringify(continuation.battleId)} but turn.battle is null`
      );
    }
    if (turn.battle.battleId !== continuation.battleId) {
      throw new SessionLoadError(
        location,
        `turn.pendingBattleDamageContinuation refers to battle ${JSON.stringify(continuation.battleId)} but turn.battle is ${JSON.stringify(turn.battle.battleId)}`
      );
    }
    if (turn.battleSubPhase !== "DAMAGE_STEP") {
      throw new SessionLoadError(
        location,
        `turn.pendingBattleDamageContinuation exists while turn.battleSubPhase is ${String(turn.battleSubPhase)}; expected DAMAGE_STEP`
      );
    }
  }
  if (turn.battle?.pendingTriggerLifeCard && turn.battleSubPhase !== "DAMAGE_STEP") {
    throw new SessionLoadError(
      location,
      `turn.battle.pendingTriggerLifeCard exists while turn.battleSubPhase is ${String(turn.battleSubPhase)}; expected DAMAGE_STEP`
    );
  }
  if (turn.pendingTriggerFromEffect && turn.battle?.pendingTriggerLifeCard) {
    throw new SessionLoadError(
      location,
      "turn.pendingTriggerFromEffect and turn.battle.pendingTriggerLifeCard are both set; only one Trigger window can be open"
    );
  }
}

/** Same predicate as effect-resolver/resume/cost.ts isLegacyCostTransactionFrame. */
export function isLegacyCostTransactionFrame(frame: EffectStackFrame): boolean {
  return (
    frame.costTransactionState === undefined &&
    (frame.currentCostIndex > 0 ||
      frame.accumulatedEvents.length > 0 ||
      frame.costResultRefs.some(([, result]) => result.count > 0))
  );
}

function isOnField(state: GameState, instanceId: string): boolean {
  return state.players.some(
    (player) =>
      player.leader.instanceId === instanceId ||
      player.stage?.instanceId === instanceId ||
      player.characters.some((card) => card?.instanceId === instanceId)
  );
}

/** OPT-884: a Damage Step waiting on a K.O. replacement answer that nothing can deliver. */
export function isStuckDamageStep(state: GameState): boolean {
  const continuation = state.turn.pendingBattleDamageContinuation;
  return (
    state.turn.battleSubPhase === "DAMAGE_STEP" &&
    continuation?.stage === "CHARACTER_KO_REPLACEMENT" &&
    continuation.resolution === undefined &&
    state.pendingPrompt === null &&
    state.effectStack.length === 0 &&
    !isOnField(state, continuation.targetInstanceId)
  );
}

export interface LegacyShapeReport {
  shape: LegacyShape;
  frameId?: string;
}

/**
 * Classify the legacy shapes present in a converted, validated state. Pure;
 * the caller logs the result. Each shape's disposition is recorded in
 * SAVED-STATE-COMPATIBILITY.md §4.
 */
export function classifyLegacyShapes(state: GameState): LegacyShapeReport[] {
  const reports: LegacyShapeReport[] = [];
  for (const frame of state.effectStack) {
    if (frame.phaseBoundaryContinuation && !("stage" in frame.phaseBoundaryContinuation)) {
      reports.push({ shape: "legacy.stage_less_phase_boundary", frameId: frame.id });
    }
    if (frameKindOf(frame) === "COST" && isLegacyCostTransactionFrame(frame)) {
      reports.push({ shape: "legacy.cost_transaction_frame", frameId: frame.id });
    }
  }
  const resume = state.pendingPrompt?.resumeContext;
  if (
    typeof resume === "object" &&
    resume !== null &&
    "effectSourceInstanceId" in resume &&
    "remainingActions" in resume
  ) {
    reports.push({ shape: "legacy.structural_resume_context" });
  }
  if (isStuckDamageStep(state)) {
    reports.push({ shape: "legacy.stuck_damage_step" });
  }
  return reports;
}

export function logLegacyShapes(state: GameState, location: string): void {
  for (const report of classifyLegacyShapes(state)) {
    log("session.legacy_shape", {
      gameId: state.id,
      location,
      shape: report.shape,
      ...(report.frameId ? { frameId: report.frameId } : {}),
    });
  }
}
