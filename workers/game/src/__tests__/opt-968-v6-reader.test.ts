import { current968BattleExpected } from "./opt-1003-battle-expectations.js";
import { writerEnvelope } from "./opt-1003-writer-expectations.js";
import { describe, expect, it } from "vitest";
import corpus from "./fixtures/opt-968-writer-corpus.json";
import { SessionRepository } from "../session/persistence.js";
import { rig, synSchema } from "./opt-960-rig.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import type { GameAction, GameState } from "../types.js";

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
      expect(loaded.state.schemaVersion).toBe(8);
      expect(loaded.state.costSemanticsVersion).toBe(6);
      expect(loaded.undoHistory).toHaveLength(1);
      if (mode === "mixedUndo") expect(loaded.undoHistory[0]).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
      else {
        expect(loaded.undoHistory[0].schemaVersion).toBe(8);
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
        expect(resumed.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
        const next = new MemorySessionStorage();
        await new SessionRepository(next, options).save({ ...loaded, state: resumed.state, undoHistory: loaded.undoHistory });
        loaded = (await new SessionRepository(next, options).load())!;
        expect(loaded.state.schemaVersion).toBe(8);
      expect(loaded.state.costSemanticsVersion).toBe(6);
        const nextPause = scenario.cases[captured.index + replyIndex + 1];
        if (nextPause) {
          const expectedPause = (nextPause.stored.session as { state: unknown }).state;
          expect(JSON.parse(JSON.stringify(toPersistedGameState(loaded.state)))).toEqual(writerEnvelope(expectedPause));
        }
      }
      expect(JSON.parse(JSON.stringify(toPersistedGameState(loaded.state)))).toEqual(current968BattleExpected(scenario.name, scenario.expected));
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

it("rejects malformed complete event families on real OP15-009 v6 pauses without touching live or undo storage", async () => {
  const scenario = fixtures.scenarios.find((entry) => entry.name.startsWith("OP15-009-"))!;
  const captured = scenario.cases[0];
  const malformed = [
    [],
    ["WOULD_BE_KO", "WOULD_BE_KO", "WOULD_LEAVE_FIELD"],
    ["WOULD_BE_RESTED"],
    ["WOULD_BE_KO"],
    ["WOULD_BE_REMOVED_FROM_FIELD", "WOULD_BE_KO", "WOULD_LEAVE_FIELD"],
  ];
  for (const location of ["live", "undo"] as const) for (const events of malformed) {
    const storage = new MemorySessionStorage();
    await storage.put(structuredClone(captured.stored));
    const state = location === "live"
      ? (storage.data.get("session") as { state: { effectStack: { replacementBatch?: Record<string, unknown> }[] } }).state
      : (storage.data.get("session:undo-history") as { effectStack: { replacementBatch?: Record<string, unknown> }[] }[])[0];
    state.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!.events = events;
    const before = JSON.stringify([...storage.data]);
    await expect(new SessionRepository(storage, options).load()).rejects.toThrow();
    expect(JSON.stringify([...storage.data])).toBe(before);
  }
  const control = new MemorySessionStorage(); await control.put(structuredClone(captured.stored));
  const loaded = (await new SessionRepository(control, options).load())!;
  const resumed = resumePromptLifecycle(loaded.state, captured.replies[0], loaded.cardDb, {
    drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
  });
  expect(resumed.responseRejected).toBeFalsy();
  expect(JSON.parse(JSON.stringify(toPersistedGameState(resumed.state)))).toEqual(current968BattleExpected(scenario.name, scenario.expected));
  expect(resumed.state.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(0);
});

it("retains optional missing-event inference for historical batch continuations", async () => {
  const scenario = fixtures.scenarios.find((entry) => entry.name.startsWith("OP15-009-"))!;
  const storage = new MemorySessionStorage(); await storage.put(structuredClone(scenario.cases[0].stored));
  const session = storage.data.get("session") as { state: { effectStack: { replacementBatch?: Record<string, unknown> }[] } };
  delete session.state.effectStack.find((frame) => frame.replacementBatch)!.replacementBatch!.events;
  await expect(new SessionRepository(storage, options).load()).resolves.not.toBeNull();
});

it("requires ordering prompt choices to be a unique bijection while allowing permutation", async () => {
  const scenario = fixtures.scenarios.find((entry) => entry.cases.some((captured) => {
    const session = captured.stored.session as { state: { pendingPrompt?: { options: { promptType: string } } } };
    return session.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE";
  }))!;
  const captured = scenario.cases.find((candidate) => {
    const session = candidate.stored.session as { state: { pendingPrompt?: { options: { promptType: string } } } };
    return session.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE";
  })!;
  for (const location of ["live", "undo"] as const) {
    const storage = new MemorySessionStorage(); await storage.put(structuredClone(captured.stored));
    const state = location === "live"
      ? (storage.data.get("session") as { state: { pendingPrompt: { options: { choices: { id: string; label: string }[] } } } }).state
      : (storage.data.get("session:undo-history") as { pendingPrompt: { options: { choices: { id: string; label: string }[] } } }[])[0];
    state.pendingPrompt.options.choices[1] = { ...state.pendingPrompt.options.choices[0] };
    const before = JSON.stringify([...storage.data]);
    await expect(new SessionRepository(storage, options).load()).rejects.toThrow("replacement ordering prompt disagrees");
    expect(JSON.stringify([...storage.data])).toBe(before);
  }
  const storage = new MemorySessionStorage(); await storage.put(structuredClone(captured.stored));
  const session = storage.data.get("session") as { state: { pendingPrompt: { options: { choices: unknown[] } } } };
  session.state.pendingPrompt.options.choices.reverse();
  let loaded = (await new SessionRepository(storage, options).load())!;
  for (const reply of captured.replies) {
    const resumed = resumePromptLifecycle(loaded.state, reply, loaded.cardDb, {
      drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
    });
    expect(resumed.responseRejected).toBeFalsy();
    const next = new MemorySessionStorage();
    await new SessionRepository(next, options).save({ ...loaded, state: resumed.state });
    loaded = (await new SessionRepository(next, options).load())!;
  }
  expect(JSON.parse(JSON.stringify(toPersistedGameState(loaded.state)))).toEqual(current968BattleExpected(scenario.name, scenario.expected));
});

const nativeOrderingPause = fixtures.scenarios.flatMap((scenario) => scenario.cases).find((captured) => {
  const state = (captured.stored.session as { state: GameState }).state;
  return state.effectStack.some((frame) => frame.replacementBatch?.orderingEffectIds);
})!;
const orderingDefects = ["wrongChooser", "wrongFrameController", "mixedCandidateController", "disabledChoice", "allDisabled"] as const;
for (const location of ["live", "undo"] as const) for (const defect of orderingDefects) {
  it(`native ordering rejects ${defect} in ${location} without changing storage`, async () => {
    const storage = new MemorySessionStorage(); await storage.put(structuredClone(nativeOrderingPause.stored));
    const state = location === "live"
      ? (storage.data.get("session") as { state: GameState }).state
      : (storage.data.get("session:undo-history") as GameState[])[0];
    const prompt = state.pendingPrompt!;
    if (prompt.options.promptType !== "PLAYER_CHOICE") throw new Error("Expected captured ordering prompt");
    const frame = state.effectStack.find((frame) => frame.id === prompt.resumeContext)!;
    if (defect === "wrongChooser") prompt.respondingPlayer = prompt.respondingPlayer === 0 ? 1 : 0;
    if (defect === "wrongFrameController") frame.controller = frame.controller === 0 ? 1 : 0;
    if (defect === "mixedCandidateController") {
      const candidateId = prompt.options.choices[0].id;
      const candidate = state.activeEffects.find((effect) => effect.id === candidateId)!;
      candidate.controller = candidate.controller === 0 ? 1 : 0;
    }
    if (defect === "disabledChoice") prompt.options.choices[0].disabled = true;
    if (defect === "allDisabled") prompt.options.choices.forEach((choice) => { choice.disabled = true; });
    const before = JSON.stringify([...storage.data]);
    await expect(new SessionRepository(storage, options).load()).rejects.toThrow(/replacement/);
    expect(JSON.stringify([...storage.data])).toBe(before);
  });
}

for (const location of ["live", "undo"] as const) for (const stale of ["missingCandidate", "allMissing", "changedResource"] as const) {
  it(`native ordering retains ${stale} recheck from ${location}`, async () => {
    const storage = new MemorySessionStorage(); await storage.put(structuredClone(nativeOrderingPause.stored));
    const state = location === "live"
      ? (storage.data.get("session") as { state: GameState }).state
      : (storage.data.get("session:undo-history") as GameState[])[0];
    const prompt = state.pendingPrompt!;
    if (prompt.options.promptType !== "PLAYER_CHOICE") throw new Error("Expected captured ordering prompt");
    const candidateId = prompt.options.choices[0].id;
    const frame = state.effectStack.find((frame) => frame.id === prompt.resumeContext)!;
    const targetCount = frame.replacementBatch!.allTargetIds.length;
    if (stale === "missingCandidate") state.activeEffects = state.activeEffects.filter((effect) => effect.id !== candidateId);
    else if (stale === "allMissing") {
      const ids = frame.replacementBatch!.orderingEffectIds!;
      state.activeEffects = state.activeEffects.filter((effect) => !ids.includes(effect.id));
    } else state.players[prompt.respondingPlayer].life = [];
    let loaded = (await new SessionRepository(storage, options).load())!;
    if (location === "undo") {
      const restored = new MemorySessionStorage();
      await new SessionRepository(restored, options).save({ ...loaded, state: loaded.undoHistory[0] });
      loaded = (await new SessionRepository(restored, options).load())!;
    }
    const resumed = resumePromptLifecycle(loaded.state, { type: "PLAYER_CHOICE", choiceId: candidateId }, loaded.cardDb, {
      drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
    });
    expect(resumed.responseRejected).toBeFalsy();
    let completed = resumed.state;
    if (stale === "missingCandidate") {
      expect(completed.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      expect(completed.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(0);
      completed = resumePromptLifecycle(completed, { type: "PLAYER_CHOICE", choiceId: "skip" }, loaded.cardDb, {
        drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
      }).state;
    }
    expect(completed.pendingPrompt).toBeNull();
    expect(completed.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(targetCount);
  });
}

for (const stale of ["missingCandidate", "allMissing", "changedResource"] as const) {
  it(`single battle ordering retains ${stale} recheck and exhausts its original consequence once`, async () => {
    const r = rig(); r.state.schemaVersion = 6; delete r.state.costSemanticsVersion; r.deck(0, 10); r.deck(1, 10);
    const target = r.put("OPT968-SINGLE-STALE-TARGET", 0, "CHARACTER", { state: "RESTED", data: { power: 5000 } });
    for (const id of ["OPT968-SINGLE-REPLACER-A", "OPT968-SINGLE-REPLACER-B"]) r.put(id, 0, "CHARACTER", {
      data: { power: 9000 },
      schema: synSchema(id, [{ id: "replace", category: "replacement", flags: { optional: true },
        replaces: { event: "WOULD_BE_KO", target_filter: { controller: "SELF", card_type: "CHARACTER" } },
        replacement_actions: [{ type: "REST_DON", params: { amount: 1 } }],
      }]),
    });
    r.state.players[0].donCostArea = [{ instanceId: "single-stale-don", state: "ACTIVE", attachedTo: null }];
    const attacker = r.put("OPT968-SINGLE-STALE-ATTACKER", 1, "CHARACTER", { data: { power: 7000 } });
    r.state.turn.activePlayerIndex = 1;
    r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1);
    while (!r.state.pendingPrompt && r.state.turn.battle) r.act({ type: "PASS" });
    expect(r.promptType()).toBe("PLAYER_CHOICE"); await r.reload();
    const prompt = r.state.pendingPrompt!;
    if (prompt.options.promptType !== "PLAYER_CHOICE") throw new Error("Expected ordering prompt");
    const ids = prompt.options.choices.map((choice) => choice.id);
    if (stale === "changedResource") r.state.players[0].donCostArea = [];
    else r.state.activeEffects = r.state.activeEffects.filter((effect) => stale === "allMissing" ? !ids.includes(effect.id) : effect.id !== ids[0]);
    r.act({ type: "PLAYER_CHOICE", choiceId: ids[0] });
    if (stale === "missingCandidate") {
      expect(r.promptType()).toBe("OPTIONAL_EFFECT");
      expect(r.state.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(0);
      r.decline();
    }
    expect(r.state.pendingPrompt).toBeNull(); expect(r.state.turn.battle).toBeNull();
    expect(r.state.eventLog.filter((event) => event.type === "CARD_KO")).toHaveLength(1);
    expect(r.state.eventLog.filter((event) => event.type === "END_OF_BATTLE")).toHaveLength(1);
    expect(r.state.players[0].donCostArea.every((don) => don.state === "ACTIVE")).toBe(true);
  });
}
