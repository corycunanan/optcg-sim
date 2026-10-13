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
 * Version 2 (OPT-980, PR 4a of OPT-962) adds the End Phase `stage` on
 * `PhaseBoundaryContinuation`, the per-obligation `step` tag and
 * `activatedWaveEffects`. PR 4a (OPT-980) shipped the reader; PR 4b
 * (OPT-924) flips the writer to 2 (SAVED-STATE-COMPATIBILITY.md §1.6, §6).
 */

import type { EffectStackFrame, GameState, PhaseBoundaryContinuation } from "../types.js";
import { log } from "../lib/log.js";

/** The version this build's writer emits for state its own engine produces. */
export const GAME_STATE_SCHEMA_VERSION = 2;
/** The newest version this build can read (the runtime shape). */
export const LATEST_READABLE_GAME_STATE_SCHEMA_VERSION = 2;
export const GAME_STATE_SCHEMA_VERSION_KEY = "schemaVersion";
/** Versions this build can read. Retiring one follows the support-window policy (§3). */
export const SUPPORTED_GAME_STATE_SCHEMA_VERSIONS: readonly number[] = [1, 2];
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
  | "legacy.stuck_damage_step"
  /** Battle and effect Trigger windows both parked; the coordinator serves the battle one first. */
  | "legacy.two_trigger_windows"
  /** pendingBattleDamageContinuation with no battle, another battle, or outside DAMAGE_STEP; resumeBattleDamageContinuation drops it (battle.ts). */
  | "legacy.orphan_battle_continuation"
  /** battle.pendingTriggerLifeCard outside DAMAGE_STEP. */
  | "legacy.trigger_window_outside_damage_step";

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
    const newer = stored > LATEST_READABLE_GAME_STATE_SCHEMA_VERSION;
    throw new SessionLoadError(
      location,
      `has unsupported game-state schema version ${stored} (${newer ? "written by a newer build; roll forward to a build that reads it" : "retired; see the support window in docs/game-engine/SAVED-STATE-COMPATIBILITY.md"}); this build supports ${SUPPORTED_GAME_STATE_SCHEMA_VERSIONS.join(", ")}`
    );
  }
  return stored;
}

type Converter = (raw: Record<string, unknown>, location: string) => Record<string, unknown>;

/** The stage a version 1 (stage-less) End Phase frame converts to (§6). */
export const LEGACY_END_PHASE_STAGE = "LEGACY_SCHEDULED_ACTIONS" as const;

/** Keys a version 1 writer never wrote on a phase-boundary continuation or its entries. */
const V2_ONLY_CONTINUATION_KEYS = ["stage", "activatedWaveEffects"] as const;

/**
 * Version 1 → version 2. Removes the envelope key and gives every stage-less
 * End Phase frame `stage: "LEGACY_SCHEDULED_ACTIONS"`: expiry already ran,
 * the waves are skipped, and resume drains `remainingScheduledActions` then
 * hands off, exactly as the version 1 engine did. Nothing else changes: no
 * wave is added, no expiry re-runs, no entry is reordered or tagged.
 *
 * A version 1 object that already carries a version 2 key was not written by
 * any version 1 writer, so it is rejected rather than reinterpreted. The
 * converter never drops an unknown field; strict validation rejects those.
 */
const convertFromV1: Converter = (raw, location) => {
  const rest: Record<string, unknown> = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  if (!Array.isArray(rest.effectStack)) return rest;
  let changed = false;
  const effectStack = rest.effectStack.map((frame: unknown, index: number) => {
    if (!isRecord(frame) || !isRecord(frame.phaseBoundaryContinuation)) return frame;
    const continuation = frame.phaseBoundaryContinuation;
    const ref = `effectStack[${index}].phaseBoundaryContinuation`;
    for (const key of V2_ONLY_CONTINUATION_KEYS) {
      if (key in continuation) {
        throw new SessionLoadError(location, `${ref} carries ${key}, which no version 1 writer wrote; a staged End Phase frame must be stored as schemaVersion 2`);
      }
    }
    const entries = continuation.remainingScheduledActions;
    if (Array.isArray(entries)) {
      entries.forEach((entry: unknown, entryIndex: number) => {
        if (isRecord(entry) && "step" in entry) {
          throw new SessionLoadError(location, `${ref}.remainingScheduledActions[${entryIndex}] carries step, which no version 1 writer wrote; a staged End Phase frame must be stored as schemaVersion 2`);
        }
      });
    }
    changed = true;
    return { ...frame, phaseBoundaryContinuation: { ...continuation, stage: LEGACY_END_PHASE_STAGE } };
  });
  return changed ? { ...rest, effectStack } : rest;
};

/** Version 2 is the runtime shape; the converter only removes the envelope key. */
const convertFromV2: Converter = (raw) => {
  if (!(GAME_STATE_SCHEMA_VERSION_KEY in raw)) return raw;
  const rest: Record<string, unknown> = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  return rest;
};

/** Converter for version N produces version N + 1; the last one produces the runtime shape. */
const CONVERTERS: Record<number, Converter> = {
  1: convertFromV1,
  2: convertFromV2,
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
  let converted = raw;
  for (let step = version; step <= LATEST_READABLE_GAME_STATE_SCHEMA_VERSION; step += 1) {
    const converter = CONVERTERS[step];
    if (!converter) {
      throw new SessionLoadError(
        location,
        `has game-state schema version ${version} with no converter registered for version ${step}`
      );
    }
    converted = converter(converted, location);
  }
  return converted;
}

/**
 * Writer side of the contract (SAVED-STATE-COMPATIBILITY.md §1.6). From PR 4b
 * (OPT-924) every live state and undo snapshot is written as version 2:
 * `schemaVersion: 2` first, every End Phase frame with its stage. A runtime
 * frame without a stage can only be a version 1 frame, so it is written with
 * the legacy stage, which is its version 1 meaning; the PR 4a reader
 * (`9da8ba17`) rejects a version 2 frame without a stage.
 */
export function toPersistedGameState(state: GameState): GameState {
  const unstaged = state.effectStack.some(
    (frame) => frame.phaseBoundaryContinuation && frame.phaseBoundaryContinuation.stage === undefined
  );
  const effectStack = unstaged
    ? state.effectStack.map((frame) =>
        frame.phaseBoundaryContinuation && frame.phaseBoundaryContinuation.stage === undefined
          ? { ...frame, phaseBoundaryContinuation: { ...frame.phaseBoundaryContinuation, stage: LEGACY_END_PHASE_STAGE } }
          : frame
      )
    : state.effectStack;
  return { [GAME_STATE_SCHEMA_VERSION_KEY]: GAME_STATE_SCHEMA_VERSION, ...state, effectStack } as GameState;
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
      return endPhaseStageViolation(continuation);
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
 * Stage semantics of a converted End Phase frame (SAVED-STATE-COMPATIBILITY.md
 * §6). Each rule matches what the PR 4b writer produces at that stage:
 *   - `LEGACY_SCHEDULED_ACTIONS` (a converted version 1 frame): no
 *     `activatedWaveEffects`, no `step` on any entry.
 *   - every other stage: `activatedWaveEffects` present, every entry tagged.
 *   - the two wave stages: no collected obligation yet (empty list).
 *   - `TURN_PLAYER_END_OF_TURN`: every entry is the turn player's, step `TURN_PLAYER`.
 *   - `NON_TURN_PLAYER_END_OF_TURN`: every entry is the non-turn player's, step `NON_TURN_PLAYER`.
 */
function endPhaseStageViolation(continuation: PhaseBoundaryContinuation): string | null {
  const stage = continuation.stage;
  const entries = continuation.remainingScheduledActions;
  const ending = continuation.endingPlayerIndex;
  if (stage === undefined) return "has a phaseBoundaryContinuation with no stage after conversion";
  if (stage === LEGACY_END_PHASE_STAGE) {
    if (continuation.activatedWaveEffects !== undefined) {
      return "has stage LEGACY_SCHEDULED_ACTIONS with activatedWaveEffects; a legacy frame has no waves";
    }
    const tagged = entries.findIndex((entry) => entry.step !== undefined);
    if (tagged >= 0) {
      return `has stage LEGACY_SCHEDULED_ACTIONS with a step on remainingScheduledActions[${tagged}]; legacy entries are untagged`;
    }
    return null;
  }
  if (continuation.activatedWaveEffects === undefined) {
    return `has stage ${stage} without activatedWaveEffects`;
  }
  const untagged = entries.findIndex((entry) => entry.step === undefined);
  if (untagged >= 0) {
    return `has stage ${stage} with an untagged remainingScheduledActions[${untagged}]`;
  }
  if (stage === "END_OF_YOUR_TURN_WAVE" || stage === "END_OF_OPPONENT_TURN_WAVE") {
    return entries.length > 0
      ? `has stage ${stage} with ${entries.length} remaining scheduled action(s); obligations are collected only after both waves`
      : null;
  }
  const step = stage === "TURN_PLAYER_END_OF_TURN" ? "TURN_PLAYER" : "NON_TURN_PLAYER";
  const owner = step === "TURN_PLAYER" ? ending : ending === 0 ? 1 : 0;
  const wrong = entries.findIndex((entry) => entry.step !== step || entry.controller !== owner);
  if (wrong >= 0) {
    const entry = entries[wrong];
    return `has stage ${stage} but remainingScheduledActions[${wrong}] is step ${entry.step} for player ${entry.controller}; expected step ${step} for player ${owner}`;
  }
  return null;
}

/**
 * Validate every prompt/frame reference and the frame invariants of the
 * converted state (SAVED-STATE-COMPATIBILITY.md §2.3, §2.4). Throws
 * SessionLoadError naming the reference; never mutates. Battle-record
 * coherence is classified by `classifyLegacyShapes`, not rejected: the engine
 * writes two open Trigger windows (review finding A) and tolerates an orphan
 * continuation (`resumeBattleDamageContinuation` drops it).
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
    if (frame.phaseBoundaryContinuation?.stage === LEGACY_END_PHASE_STAGE) {
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
  const { turn } = state;
  if (turn.pendingTriggerFromEffect && turn.battle?.pendingTriggerLifeCard) {
    reports.push({ shape: "legacy.two_trigger_windows" });
  }
  const continuation = turn.pendingBattleDamageContinuation;
  if (
    continuation &&
    (!turn.battle ||
      turn.battle.battleId !== continuation.battleId ||
      turn.battleSubPhase !== "DAMAGE_STEP")
  ) {
    reports.push({ shape: "legacy.orphan_battle_continuation" });
  }
  if (turn.battle?.pendingTriggerLifeCard && turn.battleSubPhase !== "DAMAGE_STEP") {
    reports.push({ shape: "legacy.trigger_window_outside_damage_step" });
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
