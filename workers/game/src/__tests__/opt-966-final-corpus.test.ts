import { chooseFirstObligation, orderedEnvelope } from "./opt-981-test-ordering.js";
import { writerEnvelope } from "./opt-1003-writer-expectations.js";
import { candidateExpected } from "./fixtures/opt-968-candidate-expectations.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository, parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import manifest from "./fixtures/opt-966-final-writer-corpus.manifest.json";

type Corpus = { writerBase: string; cases: { index: number; stored: Record<string, unknown>; replies: GameAction[];
  }[]; expected: GameState;
};
const corpus = JSON.parse(gunzipSync(readFileSync(resolve(__dirname, "fixtures/opt-966-final-writer-corpus.json.gz"))).toString()) as Record<string, Corpus>;
// Retain the original four battle traces against the historical reader/engine
// contract, separately from the new production-writer traces in OPT-1003.
// No metadata promotion or completion debt is invented by this low-level path.
class HistoricalBattleRepository {
  constructor(private storage: MemorySessionStorage, _config: unknown) {}
  async load() {
    const parsed = parseStoredSession(this.storage.data.get("session"), this.storage.data.get("session:card-db"), this.storage.data.get("session:undo-history"));
    return { ...parsed, state: { ...parsed.state, schemaVersion: 6 as const },
      undoHistory: parsed.undoHistory!.map(state => ({ ...state, schemaVersion: 6 as const })),
      cardDb: new Map(Object.entries(parsed.cardDb)) };
  }
  async save(snapshot: Awaited<ReturnType<HistoricalBattleRepository["load"]>>) {
    await this.storage.put({ session: { formatVersion: 2, state: toPersistedGameState(snapshot.state), mode: snapshot.mode, pregameMode: snapshot.pregameMode, testPriorityRolls: snapshot.testPriorityRolls, historySummary: snapshot.historySummary },
      "session:card-db": Object.fromEntries(snapshot.cardDb), "session:undo-history": snapshot.undoHistory.map(toPersistedGameState) });
    return snapshot;
  }
}
const config = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
function storageFor(stored: Record<string, unknown>) {
  const storage = new MemorySessionStorage();
  for (const [key, value] of Object.entries(stored)) storage.data.set(key, structuredClone(value));
  return storage;
}

it.each(Object.keys(corpus))("replays committed actual writer live/undo and every subsequent pause: %s", async (name) => {
  const entry = corpus[name];
  expect(entry.writerBase).toBe(manifest.writerProducer);
  const root = process.env.OPT966_READER_ROOT;
  const historicalBattle = !root && name.startsWith("opt966-battle-");
  const Repository = historicalBattle ? HistoricalBattleRepository as unknown as typeof SessionRepository : root ? ((await import(`${root}/workers/game/src/session/persistence.ts`)).SessionRepository as typeof SessionRepository)
      : SessionRepository;
  const resume = root ? ((await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`)).resumePromptLifecycle as typeof resumePromptLifecycle)
      : resumePromptLifecycle;
  const expectedPauses = await Promise.all(entry.cases.map(async (item) => (await new Repository(storageFor(item.stored), config).load())!.state));
  for (const item of entry.cases) {
    const loaded = (await new Repository(storageFor(item.stored), config).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const [offset, action] of item.replies.entries()) {
        if (!root) actual = chooseFirstObligation(actual, loaded.cardDb);
        const expected = expectedPauses[item.index + offset];
        actual.pendingPrompt!.promptId = expected.pendingPrompt!.promptId;
        const storage = new MemorySessionStorage();
        await new Repository(storage, config).save({ ...loaded, state: actual, undoHistory: [actual] });
        actual = (await new Repository(storage, config).load())!.state;
        expect(actual).toEqual(
            root
              ? expected
              : historicalBattle ? candidateExpected(`final/${name}/${item.index}/pause/${offset}`)
              : orderedEnvelope(writerEnvelope(candidateExpected<GameState>(`final/${name}/${item.index}/pause/${offset}`)), actual)
          );
        const result = resume(actual, action, loaded.cardDb, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
        expect(result.responseRejected).toBeFalsy();
        actual = result.state;
      }
      expect(actual).toEqual(
          root
            ? entry.expected
            : historicalBattle ? candidateExpected(`final/${name}/${item.index}/final`)
            : orderedEnvelope(writerEnvelope(candidateExpected<GameState>(`final/${name}/${item.index}/final`)), actual)
        );
    }
  }
});
