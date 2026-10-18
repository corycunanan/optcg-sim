/**
 * Effect-stack frame kinds (OPT-940 §2.2; OPT-963 §8). The single definition
 * of a frame's kind, derived from its content, lives in the engine so the
 * resolver and the damage frames can read it without importing the session
 * layer; `session/game-state-schema.ts` re-exports it for the reader.
 */

import type { EffectStackFrame } from "../types.js";

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
 * A frame an action handler pushed to own its own pause (a REPLACEMENT or
 * REPLACEMENT_BATCH offer, an EFFECT_DAMAGE window). The handler's chain
 * continuation is inserted directly below it (resolver.ts executeActionChain),
 * so anything that must survive the handler's frame, such as the actions
 * after a choice branch, belongs on that continuation, never on this frame.
 */
export function isHandlerOwnedFrame(
  frame: Pick<EffectStackFrame, "phase" | "phaseBoundaryContinuation" | "replacement" | "replacementBatch" | "battleDamage" | "effectDamage">
): boolean {
  const kind = frameKindOf(frame);
  return kind === "REPLACEMENT" || kind === "REPLACEMENT_BATCH" || kind === "EFFECT_DAMAGE";
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

