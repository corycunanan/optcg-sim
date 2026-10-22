import { replacementEventsFor } from "../engine/replacement-events.js";
import { projectVersion5, triggerExecutionOwnerViolation } from "./version5-reader.js";
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
 *
 * Version 3 (OPT-963) moves the replacement and damage continuations into
 * four typed frame kinds (§8). PR 5a read it by lowering to the version 2
 * runtime; PR 5b raises the runtime to version 3, lifts version 2 records
 * into frames (`convertFromV2`) and writes version 3 (§1.8).
 * PR 6a reads v4 by strict lowering; runtime and writer remain v3 (§9).
 */

import type { EffectStackFrame, GameState, PhaseBoundaryContinuation } from "../types.js";
import { EFFECT_STACK_FRAME_KINDS, VERSION_3_CONTINUATION_FIELDS, VERSION_3_FRAME_KINDS, frameKindOf, type EffectStackFrameKind } from "../engine/frame-kinds.js";
import { promptCardForLifeCard, revealTriggerPromptOptions } from "../engine/damage-frames.js";
import { log } from "../lib/log.js";
import { lowerVersion4, rememberVersion4Lowering } from "./version4-reader.js";

/** The version this build's writer emits for state its own engine produces. */
export const GAME_STATE_SCHEMA_VERSION = 6;
/** The newest persisted version this build can read; v6 retains replacement scan progress. */
export const LATEST_READABLE_GAME_STATE_SCHEMA_VERSION = 7;
/** The newest runtime shape this build executes; all producers emit v6. */
export const RUNTIME_GAME_STATE_SCHEMA_VERSION = 7;
export const GAME_STATE_SCHEMA_VERSION_KEY = "schemaVersion";
/** Versions this build can read. Retiring one follows the support-window policy (§3). */
export const SUPPORTED_GAME_STATE_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7,
];
/** The version assigned to a persisted game-state object with no `schemaVersion` key. */
export const LEGACY_GAME_STATE_SCHEMA_VERSION = 1;

export {
  EFFECT_STACK_FRAME_KINDS,
  VERSION_3_CONTINUATION_FIELDS,
  VERSION_3_FRAME_KINDS,
  frameKindOf,
  type EffectStackFrameKind,
} from "../engine/frame-kinds.js";

/**
 * Legacy shapes the reader loads unchanged and reports. Each has a recorded
 * disposition and owner in SAVED-STATE-COMPATIBILITY.md §4.
 */
export type LegacyShape =
  | "legacy.stage_less_phase_boundary"
  | "legacy.structural_resume_context"
  | "legacy.cost_transaction_frame"
  /** Parked cost replacement has no final disposition and no remaining offer. No automatic repair is justified. */
  | "legacy.cost_replacement_outcome_unknown"
  | "legacy.stuck_damage_step"
  /** A BATTLE_DAMAGE frame with no battle, another battle, or outside DAMAGE_STEP; continueBattleDamageFrame drops it (battle.ts, OPT-884). */
  | "legacy.orphan_battle_continuation"
  /** A BATTLE_DAMAGE frame at its Trigger window outside DAMAGE_STEP. */
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

// ─── Version 2 → version 3: lift the records into frames (§8.3) ──────────────

interface V2LifeCard { instanceId: string; cardId: string; face: "UP" | "DOWN" }
interface V2EffectWindow {
  lifeCard: V2LifeCard;
  damagedPlayerIndex: 0 | 1;
  remainingDamages: number;
  sourceCardInstanceId: string;
  controllerIndex: 0 | 1;
}
type V2BattleContinuation =
  | { battleId: string; lifeCardInstanceId: string; damagedPlayerIndex: 0 | 1; stage: "LIFE_REMOVAL" | "DAMAGE" }
  | {
      battleId: string;
      stage: "CHARACTER_KO_REPLACEMENT";
      targetInstanceId: string;
      replacementEffectId?: string;
      causingPlayerIndex: 0 | 1;
      attackerIsCharacter: boolean;
      resolution?: "REPLACED" | "NOT_REPLACED";
    };

const LIFTED_FRAME_ID = {
  battleDamage: "v2-lift:battle-damage",
  effectDamage: "v2-lift:effect-damage",
  replacement: "v2-lift:replacement",
  replacementBatch: "v2-lift:replacement-batch",
} as const;

function liftedFrame(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    effectBlock: { id: "__engine_continuation__", category: "auto" },
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...fields,
  };
}

/**
 * Version 2 → version 3 (OPT-963 PR 5b, SAVED-STATE-COMPATIBILITY.md §8.3).
 * Every version 2 record of paused replacement or damage work becomes a
 * typed frame, live and undo, through this one hook:
 *   - `battle.pendingTriggerLifeCard` and `pendingBattleDamageContinuation`
 *     become one BATTLE_DAMAGE frame and `pendingTriggerFromEffect` an
 *     EFFECT_DAMAGE frame, inserted at the bottom of the stack in the order
 *     they opened (version 2 surfaced them only once the stack emptied, so
 *     bottom-most is the version 2 resume order);
 *   - a REPLACEMENT / REPLACEMENT_BATCH prompt context becomes a frame on top
 *     that owns the prompt;
 *   - a frame's `replacementBatchContinuation` rider becomes a
 *     REPLACEMENT_BATCH frame at INTERRUPTED_BY_TRIGGERS directly below it.
 * With both Trigger windows open the prompt is re-pointed at the top (effect)
 * frame's responder: the base coordinator deadlock (OPT-974) is recovered as
 * nesting. A version 2 object already carrying a version 3 field or phase was
 * not written by a version 2 writer and is rejected. The converter never
 * drops an unknown field; strict validation rejects those.
 */
const convertFromV2: Converter = (raw, location) => {
  const rest: Record<string, unknown> = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  const stack: unknown[] = Array.isArray(rest.effectStack) ? rest.effectStack : [];
  stack.forEach((frame: unknown, index: number) => {
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
  if (!isRecord(rest.turn)) return rest;
  const turn: Record<string, unknown> = { ...rest.turn };
  const battle = isRecord(turn.battle) ? { ...turn.battle } : null;
  let prompt = isRecord(rest.pendingPrompt) ? { ...rest.pendingPrompt } : null;
  const promptOptions = prompt && isRecord(prompt.options) ? prompt.options : null;
  const activePlayerIndex = turn.activePlayerIndex === 1 ? 1 : 0;
  const bottom: Record<string, unknown>[] = [];
  let changed = false;

  // The surfaced REVEAL_TRIGGER prompt belongs to the last window lifted
  // (PR #758 L5). A prompt re-pointed at another window (another responder
  // or another card) is rebuilt from that window's own Life card with the
  // engine's generic reveal text (the converter is deterministic and has no
  // card data); a prompt version 2 wrote for this same window without its
  // card keeps its text and gets the card. A player is never shown another
  // player's Life card.
  const pointWindowPrompt = (frameId: string, responder: 0 | 1, lifeCard: V2LifeCard) => {
    if (!prompt || promptOptions?.promptType !== "REVEAL_TRIGGER") return;
    const cards = Array.isArray(promptOptions.cards) ? promptOptions.cards : [];
    const shown = isRecord(cards[0]) ? cards[0] : undefined;
    const rePointed = prompt.respondingPlayer !== responder || (shown !== undefined && shown.instanceId !== lifeCard.instanceId);
    const options = rePointed
      ? revealTriggerPromptOptions(lifeCard, responder)
      : shown === undefined
        ? { ...promptOptions, cards: [promptCardForLifeCard(lifeCard, responder)] }
        : promptOptions;
    prompt = { ...prompt, respondingPlayer: responder, resumeContext: frameId, options };
  };

  // Every retired record is removed by PRESENCE: the version 2 terminal writer
  // stored the keys with the value undefined, which Durable Object storage
  // preserves (structured clone), and the strict schema rejects the key. An
  // undefined or null value is dropped; a record is lifted (PR #758 round 3).
  if (battle && "pendingTriggerLifeCard" in battle) {
    const lifeCard = (battle.pendingTriggerLifeCard ?? null) as V2LifeCard | null;
    delete battle.pendingTriggerLifeCard;
    changed = true;
    if (lifeCard) {
    const damagedPlayerIndex: 0 | 1 = activePlayerIndex === 0 ? 1 : 0;
    bottom.push(
      liftedFrame({
        id: LIFTED_FRAME_ID.battleDamage,
        sourceCardInstanceId: battle.attackerInstanceId,
        controller: activePlayerIndex,
        phase: "AWAITING_TRIGGER_REVEAL",
        battleDamage: { stage: "TRIGGER_WINDOW", battleId: battle.battleId, damagedPlayerIndex, lifeCard },
      })
    );
    pointWindowPrompt(LIFTED_FRAME_ID.battleDamage, damagedPlayerIndex, lifeCard);
    }
  }
  if ("pendingBattleDamageContinuation" in turn) {
    const continuation = (turn.pendingBattleDamageContinuation ?? null) as V2BattleContinuation | null;
    delete turn.pendingBattleDamageContinuation;
    changed = true;
    if (continuation) {
      const battleDamage =
        continuation.stage === "CHARACTER_KO_REPLACEMENT"
          ? {
              stage: "CHARACTER_KO_REPLACEMENT",
              battleId: continuation.battleId,
              targetInstanceId: continuation.targetInstanceId,
              ...(continuation.replacementEffectId !== undefined ? { replacementEffectId: continuation.replacementEffectId } : {}),
              causingPlayerIndex: continuation.causingPlayerIndex,
              attackerIsCharacter: continuation.attackerIsCharacter,
              ...(continuation.resolution !== undefined ? { resolution: continuation.resolution } : {}),
            }
          : {
              stage: "TRIGGER_EFFECT",
              battleId: continuation.battleId,
              damagedPlayerIndex: continuation.damagedPlayerIndex,
              lifeCardInstanceId: continuation.lifeCardInstanceId,
            };
      bottom.push(
        liftedFrame({
          id: LIFTED_FRAME_ID.battleDamage,
          sourceCardInstanceId: battle?.attackerInstanceId ?? "",
          controller: activePlayerIndex,
          phase: "INTERRUPTED_BY_TRIGGERS",
          battleDamage,
          accumulatedEvents:
            continuation.stage === "LIFE_REMOVAL"
              ? [
                  {
                    type: "CARD_REMOVED_FROM_LIFE",
                    playerIndex: continuation.damagedPlayerIndex,
                    payload: { cardInstanceId: continuation.lifeCardInstanceId },
                    propagation: { eventLogEmitted: true },
                  },
                ]
              : [],
        })
      );
      changed = true;
    }
  }
  if ("pendingTriggerFromEffect" in turn) {
    const window = (turn.pendingTriggerFromEffect ?? null) as V2EffectWindow | null;
    delete turn.pendingTriggerFromEffect;
    changed = true;
    if (window) {
      bottom.push(
        liftedFrame({
          id: LIFTED_FRAME_ID.effectDamage,
          sourceCardInstanceId: window.sourceCardInstanceId,
          controller: window.controllerIndex,
          phase: "AWAITING_TRIGGER_REVEAL",
          effectDamage: {
            stage: "TRIGGER_WINDOW",
            damagedPlayerIndex: window.damagedPlayerIndex,
            remainingDamages: window.remainingDamages,
            dealt: 0,
            sourceCardInstanceId: window.sourceCardInstanceId,
            controllerIndex: window.controllerIndex,
            lifeCard: window.lifeCard,
          },
        })
      );
      pointWindowPrompt(LIFTED_FRAME_ID.effectDamage, window.damagedPlayerIndex, window.lifeCard);
      changed = true;
    }
  }

  const middle: unknown[] = [];
  for (const frame of stack) {
    if (isRecord(frame) && "replacementBatchContinuation" in frame && !isRecord(frame.replacementBatchContinuation)) {
      // The key with no rider (undefined / null): dropped, nothing to lift.
      const { replacementBatchContinuation: _none, ...kept } = frame;
      middle.push(kept);
      changed = true;
    } else if (isRecord(frame) && isRecord(frame.replacementBatchContinuation)) {
      const { type: _type, ...replacementBatch } = frame.replacementBatchContinuation;
      middle.push(
        liftedFrame({
          id: LIFTED_FRAME_ID.replacementBatch,
          sourceCardInstanceId: frame.sourceCardInstanceId,
          controller: replacementBatch.causingController,
          phase: "INTERRUPTED_BY_TRIGGERS",
          replacementBatch,
        })
      );
      const { replacementBatchContinuation: _rider, ...kept } = frame;
      middle.push(kept);
      changed = true;
    } else {
      middle.push(frame);
    }
  }

  const top: Record<string, unknown>[] = [];
  const context = prompt?.resumeContext;
  if (prompt && isRecord(context) && context.type === "REPLACEMENT") {
    const effects = Array.isArray(rest.activeEffects) ? rest.activeEffects : [];
    const effect = effects.find((candidate) => isRecord(candidate) && candidate.id === context.effectId) as Record<string, unknown> | undefined;
    top.push(
      liftedFrame({
        id: LIFTED_FRAME_ID.replacement,
        sourceCardInstanceId: effect?.sourceCardInstanceId ?? context.targetInstanceId,
        controller: prompt.respondingPlayer,
        phase: "AWAITING_OPTIONAL_RESPONSE",
        ...(promptOptions && typeof promptOptions.effectDescription === "string"
          ? { effectDescription: promptOptions.effectDescription }
          : {}),
        replacement: { effectId: context.effectId, targetInstanceId: context.targetInstanceId, event: context.event },
      })
    );
    prompt = { ...prompt, resumeContext: LIFTED_FRAME_ID.replacement };
    changed = true;
  } else if (prompt && isRecord(context) && context.type === "REPLACEMENT_BATCH") {
    const { type: _type, ...replacementBatch } = context;
    const allTargetIds = Array.isArray(replacementBatch.allTargetIds) ? replacementBatch.allTargetIds : [];
    top.push(
      liftedFrame({
        id: LIFTED_FRAME_ID.replacementBatch,
        sourceCardInstanceId: allTargetIds[0] ?? "",
        controller: prompt.respondingPlayer,
        phase: "AWAITING_OPTIONAL_RESPONSE",
        replacementBatch,
      })
    );
    prompt = { ...prompt, resumeContext: LIFTED_FRAME_ID.replacementBatch };
    changed = true;
  }

  if (!changed) return rest;
  return {
    ...rest,
    turn: { ...turn, battle },
    effectStack: [...bottom, ...middle, ...top],
    pendingPrompt: prompt,
  };
};

/** The version 2 records the version 3 writer lifted into frames (SAVED-STATE-COMPATIBILITY.md §8.3). */
const VERSION_2_RECORDS_RETIRED_BY_V3 = ["pendingTriggerFromEffect", "pendingBattleDamageContinuation"] as const;

/**
 * Version 3 is validated as written; the converter removes the envelope key
 * and rejects, by name, a version 2 record beside the frames: this writer
 * lifts every such record into a frame (§8.3), so an object carrying both has
 * two owners for one continuation and was not written by it. (The strict
 * schema would reject the unknown key too; the named reason locates it.)
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
  // A retired key present with the value undefined/null is dropped (the
  // runtime type no longer has these fields, so this writer never emits them;
  // the strict schema would otherwise reject the key); a record is rejected.
  if (isRecord(rest.turn)) {
    const turn: Record<string, unknown> = { ...rest.turn };
    for (const key of VERSION_2_RECORDS_RETIRED_BY_V3) {
      if (!(key in turn)) continue;
      if (turn[key] !== undefined && turn[key] !== null) reject(`turn.${key}`);
      delete turn[key];
    }
    if (isRecord(turn.battle) && "pendingTriggerLifeCard" in turn.battle) {
      if (turn.battle.pendingTriggerLifeCard !== undefined && turn.battle.pendingTriggerLifeCard !== null) reject("turn.battle.pendingTriggerLifeCard");
      const { pendingTriggerLifeCard: _none, ...battle } = turn.battle;
      turn.battle = battle;
    }
    rest.turn = turn;
  }
  if (Array.isArray(rest.effectStack)) {
    rest.effectStack = rest.effectStack.map((frame: unknown, index: number) => {
      if (!isRecord(frame) || !("replacementBatchContinuation" in frame)) return frame;
      if (frame.replacementBatchContinuation !== undefined && frame.replacementBatchContinuation !== null) reject(`effectStack[${index}].replacementBatchContinuation`);
      const { replacementBatchContinuation: _none, ...kept } = frame;
      return kept;
    });
  }
  return rest;
};

/** Legacy conversion chain through the v3 runtime. v4 uses its separately validated lowering. */
const CONVERTERS: Record<number, Converter> = {
  1: convertFromV1,
  2: convertFromV2,
  3: convertFromV3,
};

/**
 * Convert a raw persisted game-state object of a recognized version into the
 * v3 validation shape. Native v4 callers validate this compatibility projection
 * and retain the original graph; historical callers lift after validation.
 * Every caller also checks continuation-reference integrity.
 */
export function convertToCurrentShape(
  raw: unknown,
  location: string
): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new SessionLoadError(location, "must be an object");
  }
  const version = readGameStateSchemaVersion(raw, location);
  if (version < 7) {
    const frames = Array.isArray(raw.effectStack) ? raw.effectStack : [];
    if (frames.some(frame => isRecord(frame) && "costReplacementResolution" in frame) ||
        (isRecord(raw.pendingPrompt) && isRecord(raw.pendingPrompt.options) && "donIdentityReturn" in raw.pendingPrompt.options)) {
      throw new SessionLoadError(location, "carries COST outcome or DON identity picker requiring schemaVersion 7");
    }
  }
  if (version < 6 && Array.isArray(raw.effectStack)) {
    for (const [index, frame] of raw.effectStack.entries()) {
      if (!isRecord(frame)) continue;
      const single = isRecord(frame.replacement) ? frame.replacement : {};
      const batch = isRecord(frame.replacementBatch)
        ? frame.replacementBatch
        : {};
      if (
        [
          "visitedEffectIds",
          "cause",
          "causingController",
          "orderingEffectIds",
        ].some((field) => field in single) ||
        ["visitedEffectIds", "events", "cause", "orderingEffectIds"].some(
          (field) => field in batch
        )
      ) {
        throw new SessionLoadError(
          location,
          `effectStack[${index}] carries replacement scan progress requiring schemaVersion 6`
        );
      }
    }
  }
  const native =
    version >= 5
      ? projectVersion5(raw, reason => { throw new SessionLoadError(location, reason); })
      : raw;
  if (version >= 4) {
    return rememberVersion4Lowering(lowerVersion4(native, reason => {
      throw new SessionLoadError(location, reason);
    }));
  }
  let converted = native;
  for (let step = version; step <= 3; step += 1) {
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
 * Writer side of the contract (SAVED-STATE-COMPATIBILITY.md §1.6, §1.8). From
 * Ordinary producers remain version 6; native version 7 is retained per
 * live state and undo snapshot. Every frame has its discriminant, every
 * End Phase frame with its stage. A runtime frame without a stage can only be
 * a version 1 frame, so it is written with the legacy stage, which is its
 * version 1 meaning.
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
  const { schemaVersion: _schemaVersion, ...rest } = state;
  return {
    // Reader preserves a native-v7 session/undo entry; ordinary engine inputs
    // still write v6 until the separately gated producer flips its version.
    [GAME_STATE_SCHEMA_VERSION_KEY]: state.schemaVersion === 7 ? 7 : GAME_STATE_SCHEMA_VERSION,
    ...rest,
    effectStack: effectStack.map((frame) => ({
      ...frame,
      kind: frameKindOf(frame),
      ...(frame.replacementBatch && { replacementBatch: {
        ...frame.replacementBatch,
        events: replacementEventsFor(frame.replacementBatch.actionKind, frame.replacementBatch.events),
      } }),
    })),
  } as GameState;
}

function frameInvariantViolation(
  frame: EffectStackFrame,
  kind: EffectStackFrameKind,
  state: GameState
): string | null {
  // Only a damage frame at TRIGGER_WINDOW waits for a reveal: the phase is
  // written by openBattleTriggerWindow and continueEffectDamageSequence alone
  // (engine/damage-frames.ts, engine/effect-damage.ts).
  if (frame.phase === "AWAITING_TRIGGER_REVEAL" && kind !== "BATTLE_DAMAGE" && kind !== "EFFECT_DAMAGE") {
    return `is ${kind} but has phase AWAITING_TRIGGER_REVEAL; only a damage frame at TRIGGER_WINDOW waits for a reveal`;
  }
  // A version 3 continuation frame owns one piece of paused work; the actions
  // after a choice branch live on the chain continuation below it (PR #758 F1).
  if (VERSION_3_FRAME_KINDS.has(kind) && frame.remainingActions.length > 0) {
    return `is ${kind} but carries ${frame.remainingActions.length} remainingActions; a continuation frame holds no chain suffix`;
  }
  switch (kind) {
    case "TRIGGER_EXECUTION": {
      const violation = triggerExecutionOwnerViolation(frame);
      if (violation) return violation;
      const index = state.effectStack.indexOf(frame);
      if (frame.triggerExecution!.selectedTrigger && index !== state.effectStack.length - 1) return "has selectedTrigger while an activated child is already present";
      return null;
    }
    case "PHASE_BOUNDARY": {
      const continuation = frame.phaseBoundaryContinuation!;
      if (frame.phase !== "INTERRUPTED_BY_TRIGGERS") {
        return `is PHASE_BOUNDARY but has phase ${frame.phase}`;
      }
      if (
        frame.batchResumeMarker ||
        frame.triggerOrderingGroup ||
        frame.costs.length > 0
      ) {
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
      return frame.batchResumeMarker
        ? null
        : "is BATCH_RESUME but has no batchResumeMarker";
    case "REPLACEMENT":
      return frame.phase === "AWAITING_OPTIONAL_RESPONSE"
        ? null
        : `is REPLACEMENT but has phase ${frame.phase}; an offer waits for its OPTIONAL_EFFECT answer`;
    case "REPLACEMENT_BATCH": {
      const batch = frame.replacementBatch!;
      if (
        frame.phase !== "AWAITING_OPTIONAL_RESPONSE" &&
        frame.phase !== "INTERRUPTED_BY_TRIGGERS"
      ) {
        return `is REPLACEMENT_BATCH but has phase ${frame.phase}`;
      }
      if (batch.currentMatchIndex > batch.pendingMatches.length) {
        return `has replacementBatch.currentMatchIndex ${batch.currentMatchIndex} past its ${batch.pendingMatches.length} pending match(es)`;
      }
      if (
        frame.phase === "AWAITING_OPTIONAL_RESPONSE" &&
        !batch.pendingMatches[batch.currentMatchIndex]
      ) {
        return `offers replacementBatch match ${batch.currentMatchIndex}, which does not exist`;
      }
      return null;
    }
    case "BATTLE_DAMAGE": {
      const expected =
        frame.battleDamage!.stage === "TRIGGER_WINDOW"
          ? "AWAITING_TRIGGER_REVEAL"
          : "INTERRUPTED_BY_TRIGGERS";
      return frame.phase === expected
        ? null
        : `is BATTLE_DAMAGE at stage ${frame.battleDamage!.stage} but has phase ${frame.phase}; expected ${expected}`;
    }
    case "EFFECT_DAMAGE": {
      const expected =
        frame.effectDamage!.stage === "TRIGGER_WINDOW"
          ? "AWAITING_TRIGGER_REVEAL"
          : "INTERRUPTED_BY_TRIGGERS";
      return frame.phase === expected
        ? null
        : `is EFFECT_DAMAGE at stage ${frame.effectDamage!.stage} but has phase ${frame.phase}; expected ${expected}`;
    }
    case "EVENT_ACTIVATION":
    case "PLAY_OVERFLOW":
    case "PREGAME":
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
  const options = state.pendingPrompt?.options;
  if (options?.promptType === "PLAYER_CHOICE" && options.donIdentityReturn) {
    const picker = options.donIdentityReturn;
    const ids = picker.groups.flatMap(group => group.donIds);
    const pool = new Set(ids);
    if (pool.size !== ids.length || picker.countMin > picker.countMax || picker.countMax > ids.length || options.donReturn) {
      throw new SessionLoadError(location, "has inconsistent DON identity picker groups/counts");
    }
    for (const choice of options.choices) {
      let selected: unknown;
      try { selected = choice.id.startsWith("don-return-ids:") ? JSON.parse(choice.id.slice("don-return-ids:".length)) : null; } catch { selected = null; }
      if (!Array.isArray(selected) || selected.length < picker.countMin || selected.length > picker.countMax ||
          new Set(selected).size !== selected.length || selected.some(id => typeof id !== "string" || !pool.has(id))) {
        throw new SessionLoadError(location, "has DON identity picker choice outside its declared pool/counts");
      }
    }
  }
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
    const batchEvents = frame.replacementBatch?.events;
    if (batchEvents) {
      const batch = frame.replacementBatch!;
      // The KO, hand/deck return and rest producers supply these exact event
      // families in order. Missing events preserves historical inference.
      const expectedEvents = replacementEventsFor(batch.actionKind);
      if (batch.event !== expectedEvents[0] || batchEvents.length !== expectedEvents.length ||
        batchEvents.some((event, index) => event !== expectedEvents[index])) {
        throw new SessionLoadError(location, `${ref} has inconsistent replacement batch events for ${batch.actionKind}`);
      }
    }
    const progress = frame.replacement ?? frame.replacementBatch;
    if (progress) {
      const visited = progress.visitedEffectIds ?? [];
      const ordering = progress.orderingEffectIds;
      if (
        new Set(visited).size !== visited.length ||
        (ordering &&
          (ordering.length < 2 ||
            new Set(ordering).size !== ordering.length ||
            ordering.some((id) => visited.includes(id))))
      ) {
        throw new SessionLoadError(
          location,
          `${ref} has inconsistent replacement visited/order ids`
        );
      }
      if (ordering) {
        const matches = frame.replacementBatch?.pendingMatches.map(
          (match) => match.effectId
        );
        if (matches && ordering.some((id) => !matches.includes(id)))
          throw new SessionLoadError(
            location,
            `${ref} orders a replacement outside its candidate set`
          );
        // A live candidate's owner must agree with the ordering owner. An
        // absent/stale candidate is deliberately left for runtime recheck.
        if (ordering.some((id) => {
          const candidate = state.activeEffects.find((effect) => effect.id === id);
          return candidate && candidate.controller !== frame.controller;
        })) {
          throw new SessionLoadError(location, `${ref} orders a replacement controlled by another player`);
        }
        const prompt = state.pendingPrompt;
        if (
          prompt?.resumeContext === frame.id &&
          (prompt.respondingPlayer !== frame.controller ||
            prompt.options.promptType !== "PLAYER_CHOICE" ||
            prompt.options.choices.length !== ordering.length ||
            new Set(prompt.options.choices.map((choice) => choice.id)).size !== ordering.length ||
            prompt.options.choices.some(
              (choice) => !ordering.includes(choice.id) || choice.disabled === true
            ))
        ) {
          throw new SessionLoadError(
            location,
            `${ref} replacement ordering prompt disagrees with candidate ids or controller`
          );
        }
      }
    }
    if (frame.costReplacementResolution !== undefined && (
      derived !== "COST" || frame.phase !== "AWAITING_COST_SELECTION" ||
      !frame.costReplacementAction || frame.costReplacementChecked !== true ||
      !frame.costs[frame.currentCostIndex] ||
      !["SELECT_TARGET", "PLAYER_CHOICE", "ARRANGE_TOP_CARDS"].includes(frame.costReplacementAction.type)
    )) {
      throw new SessionLoadError(location, `${ref} has costReplacementResolution without a checked COST replay owner`);
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
  const context = prompt?.resumeContext as { type?: unknown } | null | undefined;
  if (context && typeof context === "object" && (context.type === "REPLACEMENT" || context.type === "REPLACEMENT_BATCH")) {
    throw new SessionLoadError(
      location,
      `pendingPrompt.resumeContext is an executable ${String(context.type)} context; from version 3 a replacement prompt names its frame`
    );
  }
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
      ((promptType !== "OPTIONAL_EFFECT" &&
        !(
          promptType === "PLAYER_CHOICE" &&
          (target.replacement?.orderingEffectIds ||
            target.replacementBatch?.orderingEffectIds)
        )) ||
        target.phase !== "AWAITING_OPTIONAL_RESPONSE")
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
    if (frames.at(-1)?.id !== target.id) {
      throw new SessionLoadError(
        location,
        `${ref} names frame ${JSON.stringify(prompt.resumeContext)}, which is not the top frame ${JSON.stringify(frames.at(-1)?.id)}`
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
  // without its prompt (0 of the 4 committed engine-written version 3 states, OPT-963 review corpus).
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

/** Same predicate as effect-resolver/resume/cost.ts isLegacyCostTransactionFrame. */
export function isLegacyCostTransactionFrame(frame: EffectStackFrame): boolean {
  return (
    frame.costTransactionState === undefined &&
    (frame.currentCostIndex > 0 ||
      frame.accumulatedEvents.length > 0 ||
      frame.costResultRefs.some(([, result]) => result.count > 0))
  );
}

/** The one BATTLE_DAMAGE frame of a state, if any (one battle at a time). */
export function battleDamageFrameOf(state: GameState): EffectStackFrame | undefined {
  return state.effectStack.find((frame) => frame.battleDamage !== undefined);
}

/**
 * OPT-884: a Damage Step waiting on a K.O. replacement answer that nothing
 * can deliver: the BATTLE_DAMAGE frame is alone on the stack, unanswered, no
 * prompt is open, and the target has left the field.
 */
export function isStuckDamageStep(state: GameState): boolean {
  const frame = battleDamageFrameOf(state);
  const continuation = frame?.battleDamage;
  return (
    state.status === "IN_PROGRESS" &&
    state.turn.battle !== null &&
    state.turn.battleSubPhase === "DAMAGE_STEP" &&
    state.pendingPrompt === null &&
    (state.effectStack.length === 0 ||
      (state.effectStack.length === 1 &&
        continuation?.stage === "CHARACTER_KO_REPLACEMENT" &&
        continuation.resolution === undefined))
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
    if (frameKindOf(frame) === "COST" && frame.costReplacementAction &&
        frame.costReplacementResolution === undefined &&
        !state.effectStack.slice(state.effectStack.indexOf(frame) + 1).some(child => frameKindOf(child) === "REPLACEMENT")) {
      reports.push({ shape: "legacy.cost_replacement_outcome_unknown", frameId: frame.id });
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
  const battleFrame = battleDamageFrameOf(state);
  const continuation = battleFrame?.battleDamage;
  if (
    battleFrame &&
    continuation &&
    continuation.stage !== "TRIGGER_WINDOW" &&
    (!turn.battle ||
      turn.battle.battleId !== continuation.battleId ||
      turn.battleSubPhase !== "DAMAGE_STEP")
  ) {
    reports.push({ shape: "legacy.orphan_battle_continuation", frameId: battleFrame.id });
  }
  if (battleFrame && continuation?.stage === "TRIGGER_WINDOW" && turn.battleSubPhase !== "DAMAGE_STEP") {
    reports.push({ shape: "legacy.trigger_window_outside_damage_step", frameId: battleFrame.id });
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
