import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { LegacyReaderRepository as SessionRepository } from "./legacy-reader-repository.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import type { GameAction, GameState } from "../types.js";
type Scenario = { name: string; cases: { index: number; stored: Record<string, unknown>; replies: GameAction[] }[]; expected: unknown };
const corpus = JSON.parse(gunzipSync(readFileSync(resolve(__dirname, "fixtures/opt-968-final-writer-corpus.json.gz"))).toString()) as { scenarios: Scenario[] };
const config = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
for (const scenario of corpus.scenarios) for (const start of scenario.cases) for (const mode of ["live", "restoredUndo"] as const) {
  it(`${scenario.name}/pause${start.index}/${mode}: historical writer bytes resume (current parser/runtime with legacy boundary unless pinned)`, async () => {
    const root = process.env.OPT968_DEPLOYED_READER_ROOT;
    const repository = root ? await import(`${root}/workers/game/src/session/persistence.ts`) as { SessionRepository: typeof SessionRepository } : { SessionRepository };
    const lifecycle = root ? await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as { resumePromptLifecycle: typeof resumePromptLifecycle } : { resumePromptLifecycle };
    const writer = root ? await import(`${root}/workers/game/src/session/game-state-schema.ts`) as { toPersistedGameState: typeof toPersistedGameState } : { toPersistedGameState };
    const storage = new MemorySessionStorage(); await storage.put(structuredClone(start.stored));
    let loaded = (await new repository.SessionRepository(storage, config).load())!;
    if (mode === "restoredUndo") {
      const undoStorage = new MemorySessionStorage();
      await new repository.SessionRepository(undoStorage, config).save({ ...loaded, undoHistory: [loaded.state] });
      const saved = (await new repository.SessionRepository(undoStorage, config).load())!;
      loaded = { ...saved, state: saved.undoHistory[0] };
    }
    for (const [offset, reply] of start.replies.entries()) {
      expect(loaded.state.schemaVersion).toBe(6);
      const expectedPause = (scenario.cases[start.index + offset].stored.session as { state: GameState }).state;
      expect(JSON.parse(JSON.stringify(writer.toPersistedGameState(loaded.state)))).toEqual(expectedPause);
      const result = lifecycle.resumePromptLifecycle(loaded.state, reply, loaded.cardDb, { drainPregame: (state) => state, advanceStartOfTurn: (state) => state });
      expect(result.responseRejected).toBeFalsy();
      const next = new MemorySessionStorage();
      await new repository.SessionRepository(next, config).save({ ...loaded, state: result.state });
      loaded = (await new repository.SessionRepository(next, config).load())!;
    }
    expect(loaded.state.schemaVersion).toBe(6);
    expect(JSON.parse(JSON.stringify(writer.toPersistedGameState(loaded.state)))).toEqual(scenario.expected);
  });
}
