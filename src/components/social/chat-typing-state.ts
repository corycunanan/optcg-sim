/**
 * OPT-359 — pure helpers for the chat-widget's typing state. Pulled out of
 * the component so the throttle and the auto-clear window can be unit
 * tested without rendering React.
 */

export const TYPING_EMIT_INTERVAL_MS = 1_000;
export const TYPING_HOLD_MS = 3_000;

/**
 * Sentinel for "never emitted." Use this as the initial value of any
 * `lastEmitAt` ref so the first `shouldEmitTyping` call always returns
 * true regardless of clock state.
 */
export const NEVER_EMITTED = Number.NEGATIVE_INFINITY;

/**
 * Outbound throttle: returns true when enough time has elapsed since the
 * last emit to send another `chat:typing` event. The DO clamps to 1.5s as
 * a defensive cap; this 1s gate is the client's primary throttle.
 *
 * Initialize `lastEmitAtMs` to `NEVER_EMITTED` so the first keystroke
 * always emits.
 */
export function shouldEmitTyping(
  nowMs: number,
  lastEmitAtMs: number,
  intervalMs: number = TYPING_EMIT_INTERVAL_MS,
): boolean {
  return nowMs - lastEmitAtMs >= intervalMs;
}

/**
 * Recipient-side: indicator visibility predicate. A typing event sets
 * `until = sender's now + TYPING_HOLD_MS`; the widget renders the
 * indicator while `now < until` and clears it as soon as the window
 * elapses (driven by a 100ms tick).
 */
export function isTypingActive(
  typingUntil: number | null,
  nowMs: number,
): boolean {
  if (typingUntil === null) return false;
  return typingUntil > nowMs;
}
