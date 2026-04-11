/**
 * Effect stack helpers — LIFO stack for nested effect resolution.
 *
 * Each EffectStackFrame represents a paused effect chain. The top of the stack
 * is always the frame currently being resolved or awaiting player input.
 */

import type { GameState } from "../types.js";
import type { EffectStackFrame } from "../types.js";

// ─── Stack Operations ────────────────────────────────────────────────────────

const MAX_EFFECT_STACK_DEPTH = 100;

export function pushFrame(state: GameState, frame: EffectStackFrame): GameState {
  if (state.effectStack.length >= MAX_EFFECT_STACK_DEPTH) {
    console.error(`[EffectStack] Max depth (${MAX_EFFECT_STACK_DEPTH}) exceeded — possible infinite loop`);
    return state;
  }
  return {
    ...state,
    effectStack: [...state.effectStack, frame] as GameState["effectStack"],
  };
}

export function popFrame(state: GameState): GameState {
  const stack = state.effectStack;
  if (stack.length === 0) return state;
  return {
    ...state,
    effectStack: stack.slice(0, -1) as GameState["effectStack"],
  };
}

export function peekFrame(state: GameState): EffectStackFrame | null {
  const stack = state.effectStack;
  if (stack.length === 0) return null;
  return stack[stack.length - 1] as unknown as EffectStackFrame;
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
    effectStack: [...stack.slice(0, -1), updated] as GameState["effectStack"],
  };
}

// ─── Frame ID Generation ─────────────────────────────────────────────────────

let frameCounter = 0;

export function generateFrameId(): string {
  return `ef_${Date.now()}_${++frameCounter}`;
}
