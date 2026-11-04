import { chooseFirstObligation, orderedEnvelope } from "./opt-981-test-ordering.js";
import { writerEnvelope } from "./opt-1003-writer-expectations.js";
import { candidateExpected } from "./fixtures/opt-968-candidate-expectations.js";
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { convertPersistedGameState, SessionRepository } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import absentLegacyJson from "./fixtures/opt-966-legacy-absent-writer.json";
import explicitLegacyJson from "./fixtures/opt-966-legacy-explicit-writer.json";
import handoffJson from "./fixtures/opt-966-handoff-writer.json";
import phaseJson from "./fixtures/opt-966-endphase-writer.json";
import lifeJson from "./fixtures/opt-966-life-writer.json";
import replacementJson from "./fixtures/opt-966-replacement-writer.json";
import watcherJson from "./fixtures/opt-966-scheduled-watcher-writer.json";

type Corpus = {
  producerCommit: string;
  cases: { index: number; stored: Record<string, unknown>; replies: GameAction[];
  }[];
  expected: GameState;
};
const scenarios = [
  ["absent legacy stage", absentLegacyJson, "crossbuild"],
  ["explicit legacy stage", explicitLegacyJson, "crossbuild"],
  ["turn handoff", handoffJson, "crossbuild"],
  ["phase", phaseJson, "crossbuild-phase"],
  ["Life", lifeJson, "crossbuild"],
  ["replacement", replacementJson, "crossbuild"],
  ["scheduled watcher", watcherJson, "crossbuild"],
] as const;
const cases = scenarios.flatMap(([name, json, promptPrefix]) => {
  const corpus = json as unknown as Corpus;
  return corpus.cases.map((entry) => ({ ...entry, name, expected: corpus.expected, promptPrefix, corpus }));
});

it.each(cases)("resumes writer $name pause $index through later work in live and undo", async ({ index, stored, replies, expected, promptPrefix, corpus, name }) => {
  const storage = new MemorySessionStorage();
  await storage.put(structuredClone(stored));
  const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
  const loaded = (await new SessionRepository(storage, options).load())!;
  for (const initial of [loaded.state, loaded.undoHistory[0]]) {
    let actual = initial;
    for (const [offset, action] of replies.entries()) {
      actual = chooseFirstObligation(actual, loaded.cardDb);
      // The producer uses fixed prompt IDs to keep storage allocation identical.
      actual.pendingPrompt!.promptId = `${promptPrefix}-${index + offset}`;
      // No hidden mode survives a save: every re-park must carry its v5 owner.
      expect(actual.effectStack.some((frame) => frame.triggerExecution)).toBe(true);
      if (name.includes("legacy")) {
        expect(actual.turn.activePlayerIndex).toBe(0);
        expect(actual.effectStack.findIndex(
              (frame) => frame.phaseBoundaryContinuation))
          .toBeLessThan(actual.effectStack.findIndex((frame) => frame.triggerExecution));
      }
      const writerPrompt = candidateExpected<GameState>(
          `future/${name}/${index}/pause/${offset}`
        ).pendingPrompt;
      expect(actual.pendingPrompt?.options).toEqual(writerPrompt?.options);
      expect(actual.pendingPrompt?.respondingPlayer).toEqual(writerPrompt?.respondingPlayer);
      const nextStorage = new MemorySessionStorage();
      const repo = new SessionRepository(nextStorage, options);
      await repo.save({ ...loaded, state: actual, undoHistory: [actual] });
      actual = (await new SessionRepository(nextStorage, options).load())!.state;
      const result = resumePromptLifecycle(actual, action, loaded.cardDb, {
        drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
      });
      expect(result.responseRejected).toBe(false);
      actual = result.state;
    }
      expected = writerEnvelope(candidateExpected<GameState>(`future/${name}/${index}/final`));
      expect(actual).toEqual(orderedEnvelope(expected, actual));
      expect(actual.pendingPrompt).toBeNull();
    expect(actual.effectStack).toEqual([]);
    expect(actual.eventLog).toEqual(expected.eventLog);
    expect(actual.players).toEqual(expected.players);
    expect(actual.turn).toEqual(expected.turn);
    expect(actual.executionContext).toEqual(expected.executionContext);
  }
});


it.each(["state", "undoHistory[0]"])("keeps raw v5 missing-stage rejection in %s",
  (location) => {
  const raw = structuredClone(absentLegacyJson.cases[0].stored.session.state) as unknown as GameState;
  for (const frame of raw.effectStack) {
    if (frame.phaseBoundaryContinuation) delete frame.phaseBoundaryContinuation.stage;
  }
  expect(() => convertPersistedGameState(raw, location)).toThrow(/phaseBoundaryContinuation.stage/);
});
