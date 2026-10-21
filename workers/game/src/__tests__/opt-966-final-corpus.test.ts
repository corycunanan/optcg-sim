import { candidateExpected } from "./fixtures/opt-967-candidate-expectations.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import manifest from "./fixtures/opt-966-final-writer-corpus.manifest.json";

type Corpus = { writerBase: string; cases: { index: number; stored: Record<string, unknown>; replies: GameAction[];
  }[]; expected: GameState;
};
const corpus = JSON.parse(gunzipSync(readFileSync(resolve(__dirname, "fixtures/opt-966-final-writer-corpus.json.gz"))).toString()) as Record<string, Corpus>;
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
  const Repository = root ? ((await import(`${root}/workers/game/src/session/persistence.ts`)).SessionRepository as typeof SessionRepository)
      : SessionRepository;
  const resume = root ? ((await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`)).resumePromptLifecycle as typeof resumePromptLifecycle)
      : resumePromptLifecycle;
  const expectedPauses = await Promise.all(entry.cases.map(async (item) => (await new SessionRepository(storageFor(item.stored), config).load())!.state));
  for (const item of entry.cases) {
    const loaded = (await new Repository(storageFor(item.stored), config).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const [offset, action] of item.replies.entries()) {
        const expected = expectedPauses[item.index + offset];
        actual.pendingPrompt!.promptId = expected.pendingPrompt!.promptId;
        const storage = new MemorySessionStorage();
        await new Repository(storage, config).save({ ...loaded, state: actual, undoHistory: [actual] });
        actual = (await new Repository(storage, config).load())!.state;
        expect(actual).toEqual(
            root
              ? expected
              : candidateExpected(`final/${name}/${item.index}/pause/${offset}`)
          );
        const result = resume(actual, action, loaded.cardDb, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
        expect(result.responseRejected).toBeFalsy();
        actual = result.state;
      }
      expect(actual).toEqual(
          root
            ? entry.expected
            : candidateExpected(`final/${name}/${item.index}/final`)
        );
    }
  }
});
