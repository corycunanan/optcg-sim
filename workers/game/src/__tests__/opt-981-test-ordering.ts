/** Compatibility tests explicitly choose the former FIFO order when a new11
 * producer inserts a decision before an archived action prompt. Archived bytes
 * stay immutable; these helpers never change runtime state envelopes. */
import type { CardData, GameState } from "../types.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
export function chooseFirstObligation(state: GameState, db: Map<string, CardData>): GameState {
  if (!state.effectStack.at(-1)?.phaseBoundaryContinuation?.awaitingOrder) return state;
  const result = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0" }, db,
    { drainPregame: s => s, advanceStartOfTurn: s => s });
  if (result.responseRejected) throw Error("first obligation rejected");
  return result.state;
}
export function orderedEnvelope<T extends GameState>(expected: T, actual: GameState): T {
  // Only the independently tested producer can have changed actual to11. The
  // historical expected gameplay/IDs/ownership/queues remain exact assertions.
  return actual.schemaVersion === 11 ? { ...expected, schemaVersion: 11,
    fieldTrashSemanticsVersion: expected.schemaVersion === 9 ? 9 : expected.fieldTrashSemanticsVersion ?? 8 } : expected;
}
