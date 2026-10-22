/** Persistence boundary shared by the reader-first synthetic producer tests. */
import { expect } from "vitest";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { Rig } from "./opt-960-rig.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
export async function reloadLiveAndUndo(r: Rig): Promise<void> {
  const values = new Map<string, unknown>();
  const storage: SessionStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async put(keyOrEntries: string | Record<string, unknown>, value?: unknown) {
      for (const [key, val] of Object.entries(typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries)) {
        values.set(key, structuredClone(val));
      }
    },
    async setAlarm() {}, async deleteAlarm() {},
  };
  const repo = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" });
  const before = structuredClone(r.state);
  const saved = await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [before] });
  const loaded = (await repo.load())!;
  expect(loaded.state).toEqual(toPersistedGameState(saved.state));
  expect(loaded.undoHistory).toEqual(saved.undoHistory.map(toPersistedGameState));
  r.state = loaded.state;
}
