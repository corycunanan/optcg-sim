import { describe, expect, it } from "vitest";
import {
  NEVER_EMITTED,
  TYPING_EMIT_INTERVAL_MS,
  TYPING_HOLD_MS,
  isTypingActive,
  shouldEmitTyping,
} from "./chat-typing-state";

describe("shouldEmitTyping (client-side throttle)", () => {
  it("collapses 10 keystrokes in 1s to a single emit", () => {
    let lastEmit = NEVER_EMITTED;
    const sends: number[] = [];

    // 10 keystrokes spread evenly across a 1s window starting at t0.
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i += 1) {
      const now = t0 + i * 100;
      if (shouldEmitTyping(now, lastEmit)) {
        sends.push(now);
        lastEmit = now;
      }
    }

    expect(sends).toEqual([t0]);
  });

  it("emits again exactly when the interval has elapsed", () => {
    expect(shouldEmitTyping(TYPING_EMIT_INTERVAL_MS, 0)).toBe(true);
    expect(shouldEmitTyping(TYPING_EMIT_INTERVAL_MS - 1, 0)).toBe(false);
  });

  it("treats NEVER_EMITTED as 'always emit on the first keystroke'", () => {
    // The widget initializes its ref to NEVER_EMITTED; any real
    // `Date.now()` minus -Infinity is +Infinity ≥ interval, so the first
    // keystroke fires regardless of clock state.
    expect(shouldEmitTyping(0, NEVER_EMITTED)).toBe(true);
    expect(shouldEmitTyping(1_700_000_000_000, NEVER_EMITTED)).toBe(true);
  });
});

describe("isTypingActive (recipient-side window)", () => {
  it("is false when no typing event has arrived", () => {
    expect(isTypingActive(null, 0)).toBe(false);
  });

  it("is true while now is before until", () => {
    const t0 = 1_000_000;
    const until = t0 + TYPING_HOLD_MS;
    expect(isTypingActive(until, t0)).toBe(true);
    expect(isTypingActive(until, t0 + TYPING_HOLD_MS - 1)).toBe(true);
  });

  it("clears 3s after the last emit (now reaches until)", () => {
    const t0 = 1_000_000;
    const until = t0 + TYPING_HOLD_MS;
    expect(isTypingActive(until, until)).toBe(false);
    expect(isTypingActive(until, until + 100)).toBe(false);
  });
});
