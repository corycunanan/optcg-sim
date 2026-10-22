import { describe, expect, it } from "vitest";
import corpus from "./fixtures/opt-968-writer-corpus.json";
import { SessionRepository } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import type { GameAction } from "../types.js";

interface CapturedCase { index: number; stored: Record<string, unknown>; replies: GameAction[]; legacyUndo: Record<string, unknown> }
const fixtures = corpus as unknown as { scenarios: { name: string; cases: CapturedCase[]; expected: unknown }[] };

const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };

describe("OPT-968 v6 actual-writer corpus: semantic reader continuation", () => {
  for (const scenario of fixtures.scenarios) for (const captured of scenario.cases) for (const mode of ["live", "undo", "mixedUndo"] as const) {
    it(`${scenario.name} / start pause ${captured.index} / ${mode}: live and mixed undo retain progress through every later reply`, async () => {
      const storage = new MemorySessionStorage();
      await storage.put(structuredClone(captured.stored));
      if (mode === "mixedUndo") storage.data.set("session:undo-history", [structuredClone(captured.legacyUndo)]);
      let loaded = (await new SessionRepository(storage, options).load())!;
      expect(loaded).not.toBeNull();
      expect(loaded.state.schemaVersion).toBe(6);
      expect(loaded.undoHistory).toHaveLength(1);
      if (mode === "mixedUndo") expect(loaded.undoHistory[0].schemaVersion).toBeUndefined();
      else {
        expect(loaded.undoHistory[0].schemaVersion).toBe(6);
        if (mode === "undo") {
          const restored = new MemorySessionStorage();
          await new SessionRepository(restored, options).save({ ...loaded, state: loaded.undoHistory[0] });
          const undoLoaded = (await new SessionRepository(restored, options).load())!;
          expect(undoLoaded.state).toEqual(loaded.state);
          loaded = undoLoaded;
        }
      }
      for (const [replyIndex, reply] of captured.replies.entries()) {
        const resumed = resumePromptLifecycle(loaded.state, reply as GameAction, loaded.cardDb, {
          drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
        });
        expect(resumed.responseRejected).toBeFalsy();
        expect(resumed.state.schemaVersion).toBe(6);
        const next = new MemorySessionStorage();
        await new SessionRepository(next, options).save({ ...loaded, state: resumed.state, undoHistory: loaded.undoHistory });
        loaded = (await new SessionRepository(next, options).load())!;
        expect(loaded.state.schemaVersion).toBe(6);
        const nextPause = scenario.cases[captured.index + replyIndex + 1];
        if (nextPause) {
          const expectedPause = (nextPause.stored.session as { state: unknown }).state;
          expect(JSON.parse(JSON.stringify(toPersistedGameState(loaded.state)))).toEqual(expectedPause);
        }
      }
      expect(JSON.parse(JSON.stringify(toPersistedGameState(loaded.state)))).toEqual(scenario.expected);
    });
  }
});

it("version labels and strict progress arrays reject malformed or downgraded v6 offers", async () => {
  const candidate = fixtures.scenarios.flatMap((scenario) => scenario.cases).find((captured) => {
    const state = (captured.stored.session as { state: { effectStack: Record<string, unknown>[] } }).state;
    return state.effectStack.some((frame) => "replacementBatch" in frame);
  })!;
  for (const defect of ["wrongVersion", "duplicateVisits", "unknownField"] as const) {
    const stored = structuredClone(candidate.stored) as Record<string, unknown>;
    const session = stored.session as { state: { schemaVersion: number; effectStack: Record<string, unknown>[] } };
    const frame = session.state.effectStack.find((entry) => entry.replacementBatch)!.replacementBatch as Record<string, unknown>;
    if (defect === "wrongVersion") session.state.schemaVersion = 5;
    if (defect === "duplicateVisits") frame.visitedEffectIds = ["duplicate", "duplicate"];
    if (defect === "unknownField") frame.futureUnrecognizedProgress = true;
    const storage = new MemorySessionStorage(); await storage.put(stored);
    await expect(new SessionRepository(storage, options).load()).rejects.toThrow();
  }
});
