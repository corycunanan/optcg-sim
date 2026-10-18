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

import type {
  CardInstance,
  EffectStackFrame,
  GameState,
  PendingEvent,
  PendingPromptState,
  PhaseBoundaryContinuation,
  PromptResumeContext,
  TurnState,
} from "../types.js";
import type { ReplacementBatchResumeContext } from "../engine/replacements.js";
import { pendingPropagationEvents } from "../engine/effect-resolver/resume/events.js";
import { log } from "../lib/log.js";

/** The version this build's writer emits for state its own engine produces. */
export const GAME_STATE_SCHEMA_VERSION = 2;
/**
 * The newest version this build can read. Version 3 (OPT-963, PR 5a) is read
 * and validated as written, then lowered to the version 2 runtime shape this
 * build's engine executes (`lowerVersion3Frames`,
 * SAVED-STATE-COMPATIBILITY.md §1.7).
 */
export const LATEST_READABLE_GAME_STATE_SCHEMA_VERSION = 3;
/** The version of the runtime shape this build's engine executes. */
export const RUNTIME_GAME_STATE_SCHEMA_VERSION = 2;
export const GAME_STATE_SCHEMA_VERSION_KEY = "schemaVersion";
/** Versions this build can read. Retiring one follows the support-window policy (§3). */
export const SUPPORTED_GAME_STATE_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3];
/** The version assigned to a persisted game-state object with no `schemaVersion` key. */
export const LEGACY_GAME_STATE_SCHEMA_VERSION = 1;

export const EFFECT_STACK_FRAME_KINDS = [
  "EFFECT",
  "COST",
  "TRIGGER_ORDER",
  "TRIGGER_DRAIN",
  "BATCH_RESUME",
  "PHASE_BOUNDARY",
  // OPT-963 (version 3): typed replacement and damage continuations (§8).
  "REPLACEMENT",
  "REPLACEMENT_BATCH",
  "BATTLE_DAMAGE",
  "EFFECT_DAMAGE",
] as const;

/** Frame kinds that exist only from version 3 (every frame of these kinds carries one of the fields below). */
export const VERSION_3_FRAME_KINDS: ReadonlySet<EffectStackFrameKind> = new Set([
  "REPLACEMENT",
  "REPLACEMENT_BATCH",
  "BATTLE_DAMAGE",
  "EFFECT_DAMAGE",
] as const);

/** The one field per version 3 kind; a frame carries at most one (§2.2). */
export const VERSION_3_CONTINUATION_FIELDS = [
  "replacement",
  "replacementBatch",
  "battleDamage",
  "effectDamage",
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
  | "legacy.trigger_window_outside_damage_step"
  /** OPT-963 PR 5a: a version 3 frame lowered losslessly to its version 2 record (§1.7). */
  | "lowered.replacement"
  | "lowered.replacement_batch"
  | "lowered.battle_damage"
  | "lowered.effect_damage"
  /** OPT-963 PR 5a degraded lowerings: version 2 cannot hold the dropped part (§1.7). */
  | "lowered.deferred_triggers_dropped"
  | "lowered.effect_damage_parent_dropped"
  | "lowered.effect_damage_remaining_dropped"
  | "lowered.second_effect_damage_dropped"
  | "lowered.orphan_battle_damage_dropped"
  | "lowered.replacement_batch_dropped"
  /** Events retained on an EFFECT_DAMAGE frame at TRIGGER_EFFECT with no surviving frame to carry them. */
  | "lowered.effect_damage_events_dropped";

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

/**
 * Version 2 → version 3. Version 3 adds the four typed continuation frame
 * fields and the `AWAITING_TRIGGER_REVEAL` phase; a version 2 object carrying
 * any of them was not written by a version 2 writer and is rejected. Nothing
 * else changes: the version 2 records (`pendingTriggerFromEffect`,
 * `pendingBattleDamageContinuation`, `battle.pendingTriggerLifeCard`, frame
 * `replacementBatchContinuation`, object prompt contexts) are still the shape
 * this build's engine executes (§1.7); PR 5b lifts them into frames.
 */
const convertFromV2: Converter = (raw, location) => {
  const rest: Record<string, unknown> = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  if (!Array.isArray(rest.effectStack)) return rest;
  rest.effectStack.forEach((frame: unknown, index: number) => {
    if (!isRecord(frame)) return;
    for (const key of VERSION_3_CONTINUATION_FIELDS) {
      if (key in frame) {
        throw new SessionLoadError(location, `effectStack[${index}] carries ${key}, which no version 2 writer wrote; a typed continuation frame must be stored as schemaVersion 3`);
      }
    }
    if (frame.phase === "AWAITING_TRIGGER_REVEAL") {
      throw new SessionLoadError(location, `effectStack[${index}] has phase AWAITING_TRIGGER_REVEAL, which no version 2 writer wrote; a typed continuation frame must be stored as schemaVersion 3`);
    }
  });
  return rest;
};

/** The version 2 records the version 3 writer lifted into frames (SAVED-STATE-COMPATIBILITY.md §8.3). */
const VERSION_2_RECORDS_RETIRED_BY_V3 = ["pendingTriggerFromEffect", "pendingBattleDamageContinuation"] as const;

/**
 * Version 3 is validated as written; the converter removes the envelope key
 * and rejects, by name, a version 2 record beside the frames: the version 3
 * writer (PR 5b) lifts every such record into a frame, so an object carrying
 * both has two owners for one continuation and was not written by it.
 * (A version 1 or 2 object has lost its envelope key by the time it gets
 * here and is left alone: its records are the shape this build executes.)
 */
const convertFromV3: Converter = (raw, location) => {
  if (!(GAME_STATE_SCHEMA_VERSION_KEY in raw)) return raw;
  const rest: Record<string, unknown> = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  const reject = (field: string) => {
    throw new SessionLoadError(
      location,
      `is schemaVersion 3 but carries ${field}, a version 2 record the version 3 writer lifts into a frame`
    );
  };
  const turn = isRecord(rest.turn) ? rest.turn : undefined;
  if (turn) {
    for (const key of VERSION_2_RECORDS_RETIRED_BY_V3) {
      if (turn[key] !== undefined && turn[key] !== null) reject(`turn.${key}`);
    }
    if (isRecord(turn.battle) && turn.battle.pendingTriggerLifeCard !== undefined) reject("turn.battle.pendingTriggerLifeCard");
  }
  if (Array.isArray(rest.effectStack)) {
    rest.effectStack.forEach((frame: unknown, index: number) => {
      if (isRecord(frame) && frame.replacementBatchContinuation !== undefined) reject(`effectStack[${index}].replacementBatchContinuation`);
    });
  }
  const prompt = isRecord(rest.pendingPrompt) ? rest.pendingPrompt : undefined;
  const context = prompt && isRecord(prompt.resumeContext) ? prompt.resumeContext : undefined;
  if (context && (context.type === "REPLACEMENT" || context.type === "REPLACEMENT_BATCH")) {
    reject(`pendingPrompt.resumeContext of type ${String(context.type)}`);
  }
  return rest;
};

/** Converter for version N produces version N + 1; the last one produces the latest readable shape. */
const CONVERTERS: Record<number, Converter> = {
  1: convertFromV1,
  2: convertFromV2,
  3: convertFromV3,
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
  frame: Pick<
    EffectStackFrame,
    "phase" | "phaseBoundaryContinuation" | "replacement" | "replacementBatch" | "battleDamage" | "effectDamage"
  >
): EffectStackFrameKind {
  if (frame.replacement) return "REPLACEMENT";
  if (frame.replacementBatch) return "REPLACEMENT_BATCH";
  if (frame.battleDamage) return "BATTLE_DAMAGE";
  if (frame.effectDamage) return "EFFECT_DAMAGE";
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
  // Only a damage frame at TRIGGER_WINDOW waits for a reveal: the phase is
  // written by openBattleTriggerWindow / continueEffectDamageSequence alone
  // (engine/damage-frames.ts, engine/effect-damage.ts) and the version 2
  // engine never saw it.
  if (frame.phase === "AWAITING_TRIGGER_REVEAL" && kind !== "BATTLE_DAMAGE" && kind !== "EFFECT_DAMAGE") {
    return `is ${kind} but has phase AWAITING_TRIGGER_REVEAL; only a damage frame at TRIGGER_WINDOW waits for a reveal`;
  }
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
    case "REPLACEMENT":
      return frame.phase === "AWAITING_OPTIONAL_RESPONSE"
        ? null
        : `is REPLACEMENT but has phase ${frame.phase}; an offer waits for its OPTIONAL_EFFECT answer`;
    case "REPLACEMENT_BATCH": {
      const batch = frame.replacementBatch!;
      if (frame.phase !== "AWAITING_OPTIONAL_RESPONSE" && frame.phase !== "INTERRUPTED_BY_TRIGGERS") {
        return `is REPLACEMENT_BATCH but has phase ${frame.phase}`;
      }
      if (batch.currentMatchIndex > batch.pendingMatches.length) {
        return `has replacementBatch.currentMatchIndex ${batch.currentMatchIndex} past its ${batch.pendingMatches.length} pending match(es)`;
      }
      if (frame.phase === "AWAITING_OPTIONAL_RESPONSE" && !batch.pendingMatches[batch.currentMatchIndex]) {
        return `offers replacementBatch match ${batch.currentMatchIndex}, which does not exist`;
      }
      return null;
    }
    case "BATTLE_DAMAGE": {
      const expected = frame.battleDamage!.stage === "TRIGGER_WINDOW" ? "AWAITING_TRIGGER_REVEAL" : "INTERRUPTED_BY_TRIGGERS";
      return frame.phase === expected
        ? null
        : `is BATTLE_DAMAGE at stage ${frame.battleDamage!.stage} but has phase ${frame.phase}; expected ${expected}`;
    }
    case "EFFECT_DAMAGE": {
      const expected = frame.effectDamage!.stage === "TRIGGER_WINDOW" ? "AWAITING_TRIGGER_REVEAL" : "INTERRUPTED_BY_TRIGGERS";
      return frame.phase === expected
        ? null
        : `is EFFECT_DAMAGE at stage ${frame.effectDamage!.stage} but has phase ${frame.phase}; expected ${expected}`;
    }
    case "TRIGGER_ORDER":
    case "TRIGGER_DRAIN":
    case "EFFECT":
      return null;
  }
}

/** The one version 3 continuation field a frame carries, or the names of several (rejected). */
function version3FieldsOf(frame: EffectStackFrame): string[] {
  return VERSION_3_CONTINUATION_FIELDS.filter((field) => frame[field] !== undefined);
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

    const carried = version3FieldsOf(frame);
    if (carried.length > 1 || (carried.length === 1 && frame.phaseBoundaryContinuation)) {
      throw new SessionLoadError(
        location,
        `${ref} (frame ${JSON.stringify(frame.id)}) carries more than one continuation family: ${[...carried, ...(frame.phaseBoundaryContinuation ? ["phaseBoundaryContinuation"] : [])].join(", ")}`
      );
    }
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

    const parentId = frame.effectDamage?.parentFrameId;
    if (parentId !== undefined) {
      const parentRef = `${ref}.effectDamage.parentFrameId`;
      const parent = frames[index - 1];
      if (!parent || parent.id !== parentId) {
        throw new SessionLoadError(
          location,
          `${parentRef} names frame ${JSON.stringify(parentId)}, which is not the frame directly below it`
        );
      }
      if (
        frameKindOf(parent) !== "TRIGGER_DRAIN" ||
        parent.pausedAction?.type !== "DEAL_DAMAGE"
      ) {
        throw new SessionLoadError(
          location,
          `${parentRef} names frame ${JSON.stringify(parentId)}, which is not an effect chain paused on DEAL_DAMAGE`
        );
      }
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
    const promptType = prompt.options.promptType;
    const isDamage = kind === "BATTLE_DAMAGE" || kind === "EFFECT_DAMAGE";
    if (promptType === "REVEAL_TRIGGER" && !isDamage) {
      throw new SessionLoadError(
        location,
        `${ref} names frame ${JSON.stringify(prompt.resumeContext)} of kind ${kind} for a REVEAL_TRIGGER prompt; only a damage frame owns one`
      );
    }
    if (isDamage && (promptType !== "REVEAL_TRIGGER" || target.phase !== "AWAITING_TRIGGER_REVEAL")) {
      throw new SessionLoadError(
        location,
        `${ref} names ${kind} frame ${JSON.stringify(prompt.resumeContext)} for a ${promptType} prompt; a damage frame owns only its REVEAL_TRIGGER at AWAITING_TRIGGER_REVEAL`
      );
    }
    if (
      (kind === "REPLACEMENT" || kind === "REPLACEMENT_BATCH") &&
      (promptType !== "OPTIONAL_EFFECT" || target.phase !== "AWAITING_OPTIONAL_RESPONSE")
    ) {
      throw new SessionLoadError(
        location,
        `${ref} names ${kind} frame ${JSON.stringify(prompt.resumeContext)} for a ${promptType} prompt; a replacement frame owns only its OPTIONAL_EFFECT offer`
      );
    }
    if (kind === "REPLACEMENT" && frames.at(-1)?.id !== target.id) {
      throw new SessionLoadError(
        location,
        `${ref} names REPLACEMENT frame ${JSON.stringify(prompt.resumeContext)}, which is not the top frame; an offer is answered before anything above it`
      );
    }
  }
  // A REPLACEMENT frame exists only while its offer is pending, so it is always
  // pushed together with the prompt that names it. (A damage frame at
  // AWAITING_TRIGGER_REVEAL may sit below an attacker effect's prompt frame
  // and gets its own prompt once that unwinds, so it is not checked here.)
  const unownedOffer = frames.findIndex(
    (frame) => frameKindOf(frame) === "REPLACEMENT" && prompt?.resumeContext !== frame.id
  );
  if (unownedOffer >= 0) {
    const frame = frames[unownedOffer];
    throw new SessionLoadError(
      location,
      `effectStack[${unownedOffer}] (frame ${JSON.stringify(frame.id)}) is a REPLACEMENT frame waiting for an answer, but pendingPrompt does not name it`
    );
  }
  // Likewise a REPLACEMENT_BATCH frame offering a match: openReplacementBatchFrame
  // at AWAITING_OPTIONAL_RESPONSE and the prompt naming it are one step
  // (engine/replacements.ts, stepBatch); no engine state holds the offer
  // without its prompt (0 of 286 engine-written version 3 states, OPT-963 review).
  const unownedBatchOffer = frames.findIndex(
    (frame) =>
      frameKindOf(frame) === "REPLACEMENT_BATCH" &&
      frame.phase === "AWAITING_OPTIONAL_RESPONSE" &&
      prompt?.resumeContext !== frame.id
  );
  if (unownedBatchOffer >= 0) {
    const frame = frames[unownedBatchOffer];
    throw new SessionLoadError(
      location,
      `effectStack[${unownedBatchOffer}] (frame ${JSON.stringify(frame.id)}) is a REPLACEMENT_BATCH frame offering a match, but pendingPrompt does not name it`
    );
  }
}

// ─── OPT-963 PR 5a: lowering version 3 frames to the version 2 runtime ───────

export interface LoweringReport {
  shape: LegacyShape;
  frameId: string;
}

/**
 * Lower every version 3 continuation frame of a validated state to the
 * version 2 record this build's engine executes (SAVED-STATE-COMPATIBILITY.md
 * §1.7, the §8 table read right to left). Pure: returns the lowered state and
 * one report per lowered frame; the caller logs them.
 *
 * Lossless: every REPLACEMENT frame; a REPLACEMENT_BATCH frame (its offer
 * becomes the prompt context; a batch waiting below a substitute becomes the
 * version 2 rider on the top-most surviving frame of the segment above it,
 * where the version 2 lifecycle reads it from the frame it resumes);
 * CHARACTER_KO_REPLACEMENT with every field; a battle TRIGGER_EFFECT (version
 * 2 LIFE_REMOVAL while the retained Life removal is unscanned, else DAMAGE);
 * an effect TRIGGER_EFFECT whose retained, still-pending events move to the
 * frame directly above it (the Trigger's effect), which the version 2
 * resolver publishes and scans when that frame resolves.
 *
 * Degraded, classified (`lowered.*_dropped`) where version 2 has no place for
 * the part, so a game rolled back from PR 5b in that exact state loses it:
 *   - a damage frame's deferred `pendingTriggers` (rule 8-6-2 watchers that
 *     PR 5b holds until the damage completes; version 2 fires watchers only
 *     from its own Step 5, so after a rollback these never fire);
 *   - the parent chain frame of an EFFECT_DAMAGE frame at TRIGGER_WINDOW
 *     (the actions after DEAL_DAMAGE, e.g. OP06-116's THEN; the version 2
 *     lifecycle would leave the frame as a zombie after its pipeline-routed
 *     REVEAL_TRIGGER, so it is dropped rather than wedged);
 *   - remaining effect damage at TRIGGER_EFFECT (version 2 abandons it,
 *     OPT-926; at TRIGGER_WINDOW the count is lowered losslessly but the
 *     version 2 reply abandons it just the same);
 *   - the outer of two EFFECT_DAMAGE windows (version 2 has one slot);
 *   - a BATTLE_DAMAGE frame at TRIGGER_WINDOW whose battle is gone;
 *   - a batch waiting with nothing above it to carry the rider (transient);
 *   - retained events of an effect TRIGGER_EFFECT with no surviving frame.
 *
 * Two Trigger windows (battle below, effect above) lower to the two version 2
 * records with the battle defender's own prompt, rebuilt from the battle
 * Life card: the version 2 coordinator expects the effect player's reply but
 * `executeRevealTrigger` consumes the battle window first, so version 2
 * cannot faithfully progress this state either way (the OPT-974 base deadlock, logged
 * as `legacy.two_trigger_windows`); the lowering only guarantees that no
 * player is shown another player's Life card.
 */
export function lowerVersion3Frames(state: GameState): { state: GameState; reports: LoweringReport[] } {
  const frames = state.effectStack;
  if (!frames.some((frame) => VERSION_3_FRAME_KINDS.has(frameKindOf(frame)))) {
    return { state, reports: [] };
  }
  const reports: LoweringReport[] = [];
  const report = (shape: LegacyShape, frame: EffectStackFrame) => reports.push({ shape, frameId: frame.id });
  const prompt = state.pendingPrompt;
  const promptNames = (frame: EffectStackFrame) => prompt?.resumeContext === frame.id;

  const droppedParents = new Set(
    frames
      .filter((frame) => frame.effectDamage?.stage === "TRIGGER_WINDOW" && frame.effectDamage.parentFrameId)
      .map((frame) => frame.effectDamage!.parentFrameId!)
  );

  let battle = state.turn.battle;
  let pendingTriggerFromEffect: TurnState["pendingTriggerFromEffect"] = state.turn.pendingTriggerFromEffect;
  let pendingBattleDamageContinuation: TurnState["pendingBattleDamageContinuation"] =
    state.turn.pendingBattleDamageContinuation;
  let promptContext: PromptResumeContext | undefined;
  let promptResponder: 0 | 1 | undefined;
  let promptOptions: PendingPromptState["options"] | undefined;
  let battleWindow: EffectStackFrame | undefined;
  let effectWindow: EffectStackFrame | undefined;
  const kept: EffectStackFrame[] = [];

  // A batch waiting below a substitute rides on the top-most surviving frame
  // of the segment above it (up to the next batch frame or the stack top):
  // the version 2 lifecycle reads the rider from the frame it resumes and
  // re-attaches it to the top frame as that segment unwinds.
  let rider: { context: ReplacementBatchResumeContext; frame: EffectStackFrame; keptAt: number } | undefined;
  const flushRider = () => {
    if (!rider) return;
    if (kept.length > rider.keptAt) {
      const top = kept.length - 1;
      kept[top] = { ...kept[top], replacementBatchContinuation: rider.context };
    } else {
      report("lowered.replacement_batch_dropped", rider.frame);
    }
    rider = undefined;
  };
  // Events retained on a lowered frame move to the next surviving frame above
  // it, which the version 2 resolver publishes and scans when it resolves.
  let carried: PendingEvent[] = [];
  let carriedFrom: EffectStackFrame | undefined;
  const carry = (frame: EffectStackFrame, events: PendingEvent[]) => {
    if (events.length === 0) return;
    carried = [...carried, ...events];
    carriedFrom = frame;
  };

  for (const frame of frames) {
    if (droppedParents.has(frame.id)) {
      report("lowered.effect_damage_parent_dropped", frame);
      continue;
    }
    const kind = frameKindOf(frame);
    if (!VERSION_3_FRAME_KINDS.has(kind)) {
      kept.push(carried.length > 0 ? { ...frame, accumulatedEvents: [...carried, ...frame.accumulatedEvents] } : frame);
      carried = [];
      carriedFrom = undefined;
      continue;
    }
    if (frame.pendingTriggers.length > 0) report("lowered.deferred_triggers_dropped", frame);
    switch (kind) {
      case "REPLACEMENT": {
        const { effectId, targetInstanceId, event } = frame.replacement!;
        if (promptNames(frame)) promptContext = { type: "REPLACEMENT", effectId, targetInstanceId, event };
        report("lowered.replacement", frame);
        break;
      }
      case "REPLACEMENT_BATCH": {
        const context = { type: "REPLACEMENT_BATCH" as const, ...frame.replacementBatch! };
        if (promptNames(frame)) {
          promptContext = context;
        } else {
          flushRider();
          rider = { context, frame, keptAt: kept.length };
        }
        report("lowered.replacement_batch", frame);
        break;
      }
      case "BATTLE_DAMAGE": {
        const damage = frame.battleDamage!;
        if (damage.stage === "TRIGGER_WINDOW") {
          if (!battle || battle.battleId !== damage.battleId) {
            report("lowered.orphan_battle_damage_dropped", frame);
          } else {
            battle = { ...battle, pendingTriggerLifeCard: damage.lifeCard };
            battleWindow = frame;
            report("lowered.battle_damage", frame);
          }
          if (promptNames(frame)) {
            promptContext = null;
            promptResponder = damage.damagedPlayerIndex;
          }
        } else if (damage.stage === "TRIGGER_EFFECT") {
          const isOwnRemoval = (event: PendingEvent) =>
            event.type === "CARD_REMOVED_FROM_LIFE" &&
            (event.payload as { cardInstanceId?: string } | undefined)?.cardInstanceId === damage.lifeCardInstanceId;
          const unscannedRemoval = frame.accumulatedEvents.some(
            (event) => isOwnRemoval(event) && !event.propagation?.triggerScanned
          );
          // The removal has a version 2 home (LIFE_REMOVAL re-emits and scans
          // it); anything else still pending rides up to the Trigger's frame.
          carry(frame, pendingPropagationEvents(frame.accumulatedEvents).filter((event) => !isOwnRemoval(event)));
          pendingBattleDamageContinuation = {
            battleId: damage.battleId,
            lifeCardInstanceId: damage.lifeCardInstanceId,
            damagedPlayerIndex: damage.damagedPlayerIndex,
            stage: unscannedRemoval ? "LIFE_REMOVAL" : "DAMAGE",
          };
          report("lowered.battle_damage", frame);
        } else {
          pendingBattleDamageContinuation = {
            battleId: damage.battleId,
            stage: "CHARACTER_KO_REPLACEMENT",
            targetInstanceId: damage.targetInstanceId,
            ...(damage.replacementEffectId !== undefined ? { replacementEffectId: damage.replacementEffectId } : {}),
            causingPlayerIndex: damage.causingPlayerIndex,
            attackerIsCharacter: damage.attackerIsCharacter,
            ...(damage.resolution !== undefined ? { resolution: damage.resolution } : {}),
          };
          report("lowered.battle_damage", frame);
        }
        break;
      }
      case "EFFECT_DAMAGE": {
        const damage = frame.effectDamage!;
        if (damage.stage === "TRIGGER_WINDOW") {
          // Version 2 has one effect-window slot: the inner (later) window wins.
          if (effectWindow) report("lowered.second_effect_damage_dropped", effectWindow);
          pendingTriggerFromEffect = {
            lifeCard: damage.lifeCard,
            damagedPlayerIndex: damage.damagedPlayerIndex,
            remainingDamages: damage.remainingDamages,
            sourceCardInstanceId: damage.sourceCardInstanceId,
            controllerIndex: damage.controllerIndex,
          };
          effectWindow = frame;
          if (promptNames(frame)) {
            promptContext = null;
            promptResponder = damage.damagedPlayerIndex;
          }
          report("lowered.effect_damage", frame);
        } else {
          // The Trigger's effect resolves in the frames above and its parent
          // chain (if any) stays below: the version 2 lifecycle drains both.
          // The frame's retained events ride up to the Trigger's frame; only
          // the remaining points have no version 2 home.
          carry(frame, pendingPropagationEvents(frame.accumulatedEvents));
          if (damage.remainingDamages > 0) report("lowered.effect_damage_remaining_dropped", frame);
          report("lowered.effect_damage", frame);
        }
        break;
      }
      default:
        kept.push(frame);
    }
  }
  flushRider();
  if (carried.length > 0) {
    // Nothing above the frame: its parent chain below resolves next.
    if (kept.length > 0) {
      const top = kept.length - 1;
      kept[top] = { ...kept[top], accumulatedEvents: [...kept[top].accumulatedEvents, ...carried] };
    } else {
      report("lowered.effect_damage_events_dropped", carriedFrom!);
    }
  }

  if (battleWindow && effectWindow && prompt?.options.promptType === "REVEAL_TRIGGER") {
    // Both windows: the battle defender's own prompt (see the function comment).
    const damage = battleWindow.battleDamage!;
    if (damage.stage === "TRIGGER_WINDOW") {
      const responder = damage.damagedPlayerIndex;
      const promptCard: CardInstance = {
        instanceId: damage.lifeCard.instanceId,
        cardId: damage.lifeCard.cardId,
        zone: "LIFE",
        state: "ACTIVE",
        attachedDon: [],
        turnPlayed: null,
        controller: responder,
        owner: responder,
      };
      promptContext = null;
      promptResponder = responder;
      promptOptions = {
        promptType: "REVEAL_TRIGGER",
        cards: [promptCard],
        effectDescription: prompt.options.cards[0]?.cardId === damage.lifeCard.cardId
          ? prompt.options.effectDescription
          : "You may reveal this Trigger card to activate its effect",
        optional: false,
        timeoutMs: 30_000,
      };
    }
  }

  const turn: TurnState = {
    ...state.turn,
    battle,
    ...(pendingTriggerFromEffect !== undefined ? { pendingTriggerFromEffect } : {}),
    ...(pendingBattleDamageContinuation !== undefined ? { pendingBattleDamageContinuation } : {}),
  };
  const pendingPrompt =
    prompt && promptContext !== undefined
      ? {
          ...prompt,
          resumeContext: promptContext,
          ...(promptResponder !== undefined ? { respondingPlayer: promptResponder } : {}),
          ...(promptOptions !== undefined ? { options: promptOptions } : {}),
        }
      : prompt;
  return { state: { ...state, turn, effectStack: kept, pendingPrompt }, reports };
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
