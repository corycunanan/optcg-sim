import type { GameState } from "../types.js";

/** Expected production ingress envelope; historical payload and gameplay bytes stay exact. */
export function writerEnvelope<T>(historical: T): T {
  const source = historical as GameState;
  if (source.schemaVersion === 8) return historical;
  return {
    ...historical,
    schemaVersion: 8,
    costSemanticsVersion: 7,
  };
}

/** Expected activation of each game-state object in a split/embedded session. */
export function writerSessionEnvelope<T>(historical: T): T {
  const expected = structuredClone(historical) as Record<string, unknown>;
  const session = expected.session as {
    state: GameState;
    undoHistory?: GameState[];
  };
  session.state = writerEnvelope(session.state);
  if (session.undoHistory)
    session.undoHistory = session.undoHistory.map(writerEnvelope);
  const undo = expected["session:undo-history"] as GameState[] | undefined;
  if (undo) expected["session:undo-history"] = undo.map(writerEnvelope);
  return expected as T;
}
