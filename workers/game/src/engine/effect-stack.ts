/**
 * Effect stack helpers — LIFO stack for nested effect resolution.
 *
 * Each EffectStackFrame represents a paused effect chain. The top of the stack
 * is always the frame currently being resolved or awaiting player input.
 */

import type { GameState } from "../types.js";
import type { EffectStackFrame } from "../types.js";
import type { EffectBlock } from "./effect-types.js";
import {
  MAX_EFFECT_STACK_DEPTH,
  terminateForEngineLimit,
} from "./engine-limits.js";
import { allocateEngineId } from "./execution-context.js";

/** Typed placeholder for continuation frames that do not own a schema block. */
export const CONTINUATION_EFFECT_BLOCK: EffectBlock = {
  id: "__engine_continuation__",
  category: "auto",
};

// ─── Stack Operations ────────────────────────────────────────────────────────

export function pushFrame(state: GameState, frame: EffectStackFrame): GameState {
  if (state.status !== "IN_PROGRESS") return state;
  if (state.effectStack.length >= MAX_EFFECT_STACK_DEPTH) {
    return terminateForEngineLimit(state, {
      kind: "EFFECT_STACK_DEPTH",
      limit: MAX_EFFECT_STACK_DEPTH,
      observed: state.effectStack.length + 1,
      attemptedFrameId: frame.id,
    });
  }
  return {
    ...state,
    effectStack: [...state.effectStack, frame],
  };
}

export function popFrame(state: GameState): GameState {
  const stack = state.effectStack;
  if (stack.length === 0) return state;
  return {
    ...state,
    effectStack: stack.slice(0, -1),
  };
}

export function peekFrame(state: GameState): EffectStackFrame | null {
  const stack = state.effectStack;
  if (stack.length === 0) return null;
  return stack[stack.length - 1];
}

export function updateTopFrame(
  state: GameState,
  partial: Partial<EffectStackFrame>,
): GameState {
  const stack = state.effectStack;
  if (stack.length === 0) return state;
  const top = stack[stack.length - 1];
  const updated = { ...top, ...partial };
  return {
    ...state,
    effectStack: [...stack.slice(0, -1), updated],
  };
}

// ─── Frame ID Generation ─────────────────────────────────────────────────────

export function generateFrameId(state: GameState): { state: GameState; id: string } {
  return allocateEngineId(state, "ef");
}
