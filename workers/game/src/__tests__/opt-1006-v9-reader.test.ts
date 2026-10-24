import { expect, it } from "vitest";
import { convertPersistedGameState, promoteGameStateForWriter, SESSION_STORAGE_KEY, SESSION_CARD_DB_STORAGE_KEY, SESSION_UNDO_HISTORY_STORAGE_KEY, SessionRepository } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { hasNativeCostSemantics, hasStructuralCostSemantics } from "../engine/native-cost-semantics.js";
import { rig } from "./opt-960-rig.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

for (const mode of [6, 7, 8] as const) it(`OPT-1006 v9 preserves explicit cost mode${mode}, input and live/undo provenance`, async () => {
  const r = rig(); r.deck(0, 10); r.deck(1, 10);
  const prior = { ...r.state, schemaVersion: 8 as const, costSemanticsVersion: mode };
  const state = { ...prior, schemaVersion: 9 as const };
  const persisted = toPersistedGameState(state);
  const loaded = convertPersistedGameState(persisted, "state");
  expect(loaded.schemaVersion).toBe(9); expect(loaded.costSemanticsVersion).toBe(mode);
  expect(hasNativeCostSemantics(loaded)).toBe(mode >= 7); expect(hasStructuralCostSemantics(loaded)).toBe(mode === 8);
  expect(promoteGameStateForWriter(loaded, "state")).toBe(loaded);
  const storage = new MemorySessionStorage(); const repo = new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" });
  await repo.save({ state, cardDb: r.db, undoHistory: [prior], mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
  const snapshot = (await repo.load())!;
  expect(snapshot.state.schemaVersion).toBe(9); expect(snapshot.undoHistory.map(state => state.schemaVersion)).toEqual([8]);
  expect(prior.schemaVersion).toBe(8);
  expect(toPersistedGameState(snapshot.state).schemaVersion).toBe(9);
});
for (const mode of [undefined, null, 5, 9, "8"]) for (const undo of [false, true]) it(`OPT-1006 v9 invalid cost mode ${mode}, ${undo ? "undo" : "live"}, rejects atomically`, async () => {
  const r = rig(); const valid = { ...toPersistedGameState(r.state), schemaVersion: 8, costSemanticsVersion: 8 };
  const bad = { ...valid, schemaVersion: 9, costSemanticsVersion: mode };
  const storage = new MemorySessionStorage();
  storage.data.set(SESSION_STORAGE_KEY, { state: undo ? valid : bad, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
  storage.data.set(SESSION_CARD_DB_STORAGE_KEY, Object.fromEntries(r.db));
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, undo ? [bad] : []);
  const before = structuredClone(storage.data);
  await expect(new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" }).load()).rejects.toMatchObject({ name: "SessionLoadError", location: undo ? "undoHistory[0]" : "state", reason: expect.stringContaining("native9 requires explicit costSemanticsVersion") });
  expect(storage.data).toEqual(before); expect(storage.writes).toEqual([]);
});
