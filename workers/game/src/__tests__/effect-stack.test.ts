/**
 * OPT-160: effect-stack invariant tests.
 *
 * Unit coverage for the LIFO effect stack helpers in engine/effect-stack.ts:
 * push/pop/peek/updateTopFrame lifecycle, the MAX_EFFECT_STACK_DEPTH cap, and
 * frame-id uniqueness. These are pure helpers — tests build a minimal GameState
 * around just the effectStack field rather than a full game init.
 */

import { describe, it, expect } from "vitest";
import {
  pushFrame,
  popFrame,
  peekFrame,
  updateTopFrame,
  generateFrameId,
} from "../engine/effect-stack.js";
import type { EffectBlock } from "../engine/effect-types.js";
import type { EffectStackFrame, GameState } from "../types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function emptyState(): GameState {
  // Minimal GameState shape: we only care about effectStack for these tests.
  return { effectStack: [] } as unknown as GameState;
}

const stubBlock: EffectBlock = { id: "stub", category: "activate", actions: [] };

function makeFrame(id: string, overrides: Partial<EffectStackFrame> = {}): EffectStackFrame {
  return {
    id,
    sourceCardInstanceId: `src-${id}`,
    controller: 0,
    effectBlock: stubBlock,
    phase: "AWAITING_COST_SELECTION",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: false,
    oncePerTurnMarked: false,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...overrides,
  };
}

// ─── pushFrame ───────────────────────────────────────────────────────────────

describe("pushFrame", () => {
  it("appends a frame to the stack", () => {
    const a = makeFrame("a");
    const s1 = pushFrame(emptyState(), a);
    expect(s1.effectStack).toHaveLength(1);
    expect(s1.effectStack[0].id).toBe("a");
  });

  it("preserves LIFO ordering across multiple pushes", () => {
    let s = emptyState();
    s = pushFrame(s, makeFrame("a"));
    s = pushFrame(s, makeFrame("b"));
    s = pushFrame(s, makeFrame("c"));
    expect(s.effectStack.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input state", () => {
    const s0 = emptyState();
    const s1 = pushFrame(s0, makeFrame("a"));
    expect(s0.effectStack).toHaveLength(0);
    expect(s1).not.toBe(s0);
    expect(s1.effectStack).not.toBe(s0.effectStack);
  });

  it("rejects the push when stack is at MAX_EFFECT_STACK_DEPTH (100)", () => {
    let s = emptyState();
    for (let i = 0; i < 100; i++) s = pushFrame(s, makeFrame(`f${i}`));
    expect(s.effectStack).toHaveLength(100);

    // 101st push is dropped — infinite-loop guard. Returns the same state.
    const s2 = pushFrame(s, makeFrame("overflow"));
    expect(s2.effectStack).toHaveLength(100);
    expect(s2.effectStack[99].id).toBe("f99");
    expect(s2).toBe(s);
  });
});

// ─── popFrame ────────────────────────────────────────────────────────────────

describe("popFrame", () => {
  it("removes the top frame", () => {
    let s = emptyState();
    s = pushFrame(s, makeFrame("a"));
    s = pushFrame(s, makeFrame("b"));
    s = popFrame(s);
    expect(s.effectStack).toHaveLength(1);
    expect(s.effectStack[0].id).toBe("a");
  });

  it("is a no-op on an empty stack", () => {
    const s0 = emptyState();
    const s1 = popFrame(s0);
    expect(s1).toBe(s0);
    expect(s1.effectStack).toHaveLength(0);
  });

  it("does not mutate the input state", () => {
    const s0 = pushFrame(emptyState(), makeFrame("a"));
    const s1 = popFrame(s0);
    expect(s0.effectStack).toHaveLength(1);
    expect(s1.effectStack).toHaveLength(0);
    expect(s1).not.toBe(s0);
  });

  it("push → pop → push preserves the new frame (stack is reusable after cleanup)", () => {
    let s = pushFrame(emptyState(), makeFrame("a"));
    s = popFrame(s);
    s = pushFrame(s, makeFrame("b"));
    expect(peekFrame(s)?.id).toBe("b");
  });
});

// ─── peekFrame ───────────────────────────────────────────────────────────────

describe("peekFrame", () => {
  it("returns null on an empty stack", () => {
    expect(peekFrame(emptyState())).toBeNull();
  });

  it("returns the top frame without removing it", () => {
    let s = pushFrame(emptyState(), makeFrame("a"));
    s = pushFrame(s, makeFrame("b"));
    const top = peekFrame(s);
    expect(top?.id).toBe("b");
    expect(s.effectStack).toHaveLength(2); // unchanged
  });
});

// ─── updateTopFrame ──────────────────────────────────────────────────────────

describe("updateTopFrame", () => {
  it("merges partial fields into the top frame only", () => {
    let s = pushFrame(emptyState(), makeFrame("a"));
    s = pushFrame(s, makeFrame("b", { phase: "AWAITING_COST_SELECTION" }));
    s = updateTopFrame(s, { phase: "AWAITING_TARGET_SELECTION", costsPaid: true });

    const top = peekFrame(s);
    expect(top?.id).toBe("b");
    expect(top?.phase).toBe("AWAITING_TARGET_SELECTION");
    expect(top?.costsPaid).toBe(true);
    // Bottom frame untouched
    expect(s.effectStack[0].id).toBe("a");
    expect(s.effectStack[0].phase).toBe("AWAITING_COST_SELECTION");
  });

  it("is a no-op on an empty stack", () => {
    const s0 = emptyState();
    const s1 = updateTopFrame(s0, { costsPaid: true });
    expect(s1).toBe(s0);
  });

  it("does not mutate the existing frame object", () => {
    const frame = makeFrame("a", { costsPaid: false });
    const s0 = pushFrame(emptyState(), frame);
    const s1 = updateTopFrame(s0, { costsPaid: true });
    expect(frame.costsPaid).toBe(false); // original unchanged
    expect(peekFrame(s1)?.costsPaid).toBe(true);
  });
});

// ─── generateFrameId ─────────────────────────────────────────────────────────

describe("generateFrameId", () => {
  it("produces unique ids across rapid calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateFrameId());
    expect(ids.size).toBe(1000);
  });

  it("ids follow the ef_<ts>_<n> shape", () => {
    const id = generateFrameId();
    expect(id).toMatch(/^ef_\d+_\d+$/);
  });
});
