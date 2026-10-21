import { withStableOrderingIds } from "../engine/trigger-ordering.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import battleJson from "./fixtures/opt-966-battle-debt-writer.json";

import terminalJson from "./fixtures/opt-966-battle-terminal-writer.json";

type Corpus = {
  producerCommit: string;
  cases: { index: number; stored: Record<string, unknown>; replies: GameAction[] }[];
  expected: GameState;
};
const scenarios = [["battle substitute", battleJson, "crossbuild"], ["terminal battle substitute", terminalJson, "crossbuild"]] as const;
const cases = scenarios.flatMap(([name, json, promptPrefix]) => {
  const corpus = json as unknown as Corpus;
  return corpus.cases.map(entry => ({ ...entry, name, expected: corpus.expected, promptPrefix, corpus }));
});

it.each(cases)("resumes writer $name pause $index through later work in live and undo", async ({ index, stored, replies, expected, promptPrefix, corpus }) => {
  const storage = new MemorySessionStorage();
  await storage.put(structuredClone(stored));
  const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
  const loaded = (await new SessionRepository(storage, options).load())!;
  for (const initial of [loaded.state, loaded.undoHistory[0]]) {
    let actual = initial;
    for (const [offset, action] of replies.entries()) {
      // The producer uses fixed prompt IDs to keep storage allocation identical.
      actual.pendingPrompt!.promptId = `${promptPrefix}-${index + offset}`;
      // No hidden mode survives a save: every re-park must carry its v5 owner.
      expect(actual.effectStack.some(frame => frame.triggerExecution)).toBe(true);
      const writerPrompt = (corpus.cases[index + offset].stored.session as { state: GameState }).state.pendingPrompt;
      expect(actual.pendingPrompt?.options).toEqual(writerPrompt?.options);
      expect(actual.pendingPrompt?.respondingPlayer).toEqual(writerPrompt?.respondingPlayer);
      const nextStorage = new MemorySessionStorage();
      const repo = new SessionRepository(nextStorage, options);
      await repo.save({ ...loaded, state: actual, undoHistory: [actual] });
      actual = (await new SessionRepository(nextStorage, options).load())!.state;
      const result = resumePromptLifecycle(actual, action, loaded.cardDb, {
        drainPregame: state => state, advanceStartOfTurn: state => state,
      });
      expect(result.responseRejected).toBe(false);
      actual = result.state;
    }
    expect(actual.pendingPrompt).toBeNull();
    expect(actual.effectStack).toEqual([]);
    expect(actual.eventLog).toEqual(expected.eventLog);
    expect(actual.players).toEqual(expected.players);
    expect(actual.turn).toEqual(expected.turn);
    expect(actual.executionContext).toEqual(expected.executionContext);
    expect(actual).toEqual(expected);
    const types = actual.eventLog.map(event => event.type);
    expect(types.filter(type => type === "CARD_TRASHED")).toHaveLength(2);
    expect(types.filter(type => type === "POWER_MODIFIED")).toHaveLength(1);
    expect(types.filter(type => type === "CARD_DRAWN")).toHaveLength(1);
    expect(types.indexOf("COMBAT_VICTORY")).toBeLessThan(types.indexOf("CARD_TRASHED"));
    expect(types.indexOf("POWER_MODIFIED")).toBeLessThan(types.indexOf("END_OF_BATTLE"));
    expect(types.indexOf("END_OF_BATTLE")).toBeLessThan(types.indexOf("CARD_DRAWN"));
    expect(types.filter(type => type === "GAME_OVER")).toHaveLength(expected.status === "FINISHED" ? 1 : 0);
  }
});


it.skipIf(!process.env.OPT966_READER_ROOT)("preserves the deployed reader's full v4 battle result", async () => {
  const baseline = await import(`${process.env.OPT966_READER_ROOT}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../session/prompt-lifecycle.js");
  const { parseStoredSession } = await import("../session/persistence.js");
  const { default: legacy } = await import("./fixtures/opt-965-battle-debt.synthetic.json");
  const loaded = parseStoredSession({ state: structuredClone(legacy.state), cardDb: legacy.cardDb, undoHistory: [structuredClone(legacy.state)] });
  for (const state of [loaded.state, loaded.undoHistory[0]]) {
    expect(state.effectStack.some(frame => frame.triggerExecution)).toBe(false);
    const services = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };
    const expected = baseline.resumePromptLifecycle(structuredClone(state), legacy.reply as GameAction, new Map(Object.entries(loaded.cardDb)), services);
    const actual = resumePromptLifecycle(structuredClone(state), legacy.reply as GameAction, new Map(Object.entries(loaded.cardDb)), services);
    expect(actual).toEqual(expected);
  }
});


it.each([{ queued: false, nested: false }, { queued: true, nested: false }, { queued: true, nested: true }])("advances a loaded child owner above battle debt (queued $queued, nested $nested)", async ({ queued, nested }) => {
  const storage = new MemorySessionStorage();
  await storage.put(structuredClone(battleJson.cases[2].stored));
  const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
  const loaded = (await new SessionRepository(storage, options).load())!;
  const [owner, damage, prompt] = loaded.state.effectStack;
  if (queued) {
    owner.triggerExecution!.generations[0].triggers = withStableOrderingIds(damage.pendingTriggers);
    damage.pendingTriggers = [];
  }
  // Accepted alternate topology / progress probe, distinct from the writer's
  // ordinary owner below damage. This is not a rule-correct timing fixture.
  // Prove persistence accepts both live and undo first.
  const outer = { ...structuredClone(owner), id: "outer-trigger-owner", triggerExecution: { generations: [{ triggers: [] }] } };
  const state = { ...loaded.state, effectStack: [...(nested ? [outer] : []), damage, owner, prompt] };
  await new SessionRepository(storage, options).save({ ...loaded, state, undoHistory: [state] });
  const restored = (await new SessionRepository(storage, options).load())!;
  for (const initial of [restored.state, restored.undoHistory[0]]) {
    const action = battleJson.cases[2].replies[0] as GameAction;
    // Bounded direct advance catches no-progress before entering the session
    // drain. On the old guard this assertion fails instead of hanging Vitest.
    const step = resumeFromStack({ ...initial, pendingPrompt: null }, action, restored.cardDb);
    expect(step.state.effectStack.some(frame => frame.id === owner.id)).toBe(false);
    expect(step.state.effectStack.at(-1)?.id).toBe(damage.id);
    const result = resumePromptLifecycle(initial, action, restored.cardDb, {
      drainPregame: state => state, advanceStartOfTurn: state => state,
    });
    expect(result.responseRejected).toBe(false);
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.turn.battle).toBeNull();
    for (const type of ["END_OF_BATTLE", "COMBAT_VICTORY", "CARD_DRAWN", "POWER_MODIFIED"])
      expect(result.state.eventLog.filter(event => event.type === type)).toHaveLength(1);
    expect(result.state.eventLog.filter(event => event.type === "CARD_TRASHED")).toHaveLength(2);
  }
});
