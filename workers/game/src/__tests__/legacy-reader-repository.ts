/** Historical byte-proof harness: current parser/runtime with the legacy
 * repository boundary, NOT a pinned historical binary or ordinary writer.
 * No validation is copied and no production opt-out is introduced. Current
 * safety/promotion/persistence tests must use the real SessionRepository. */
import { parseStoredSession, type SessionStorage, type SessionSnapshot } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { compactSessionHistory, emptyEventHistorySummary } from "../session/history.js";
import { allocateEngineId, ensureExecutionContext, reconcileExecutionContextIdCounter } from "../engine/execution-context.js";

export class LegacyReaderRepository {
  private summary = emptyEventHistorySummary();
  constructor(private storage: SessionStorage, config?: unknown) { void config; }
  async load(): Promise<SessionSnapshot | null> {
    const raw = await this.storage.get<Record<string, unknown>>("session"); if (!raw) return null;
    const stored = parseStoredSession(raw, await this.storage.get("session:card-db"), await this.storage.get("session:undo-history"));
    const restore = (state: SessionSnapshot["state"]) => reconcileExecutionContextIdCounter(ensureExecutionContext(state));
    const compacted = compactSessionHistory(restore(stored.state), stored.undoHistory.map(restore), stored.historySummary);
    this.summary = compacted.historySummary;
    return { state: compacted.state, undoHistory: compacted.undoHistory, cardDb: new Map(Object.entries(stored.cardDb)), mode: stored.mode ?? "PVP", pregameMode: stored.pregameMode ?? "PRIORITY_ROLL", testPriorityRolls: stored.testPriorityRolls ?? null };
  }
  async save(snapshot: SessionSnapshot): Promise<SessionSnapshot> {
    let state = snapshot.state;
    if (state.pendingPrompt && !state.pendingPrompt.promptId) {
      const allocated = allocateEngineId(state, "prompt"); state = { ...allocated.state, pendingPrompt: { ...state.pendingPrompt, promptId: allocated.id } };
    }
    const compacted = compactSessionHistory(state, snapshot.undoHistory, this.summary); this.summary = compacted.historySummary;
    await this.storage.put({ session: { formatVersion: 2, state: toPersistedGameState(compacted.state), mode: snapshot.mode, pregameMode: snapshot.pregameMode, testPriorityRolls: snapshot.testPriorityRolls, historySummary: this.summary }, "session:card-db": Object.fromEntries(snapshot.cardDb), "session:undo-history": compacted.undoHistory.map(toPersistedGameState) });
    return { ...snapshot, state: compacted.state, undoHistory: compacted.undoHistory };
  }
}
