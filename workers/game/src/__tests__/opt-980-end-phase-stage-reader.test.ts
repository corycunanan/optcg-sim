import { persistedV3 } from "./fixtures/opt-963-v3-states.js";
/**
 * OPT-980 (PR 4a of OPT-962): the version 2 reader for the End Phase stage,
 * the v1 → v2 converter, stage semantics, mixed-version undo, and the
 * version 1 writer that keeps base-readable bytes.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §1.5, §2, §6.
 * Fixtures: `opt-962-v2-states.json` (v2, produced by the PR 4b prototype)
 * and `opt-940-writer-golden.synthetic.json` (v1, base writer). All SYNTHETIC.
 */

import { describe, expect, it } from "vitest";
import type { GameState } from "../types.js";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
  convertPersistedGameState,
} from "../session/persistence.js";
import {
  GAME_STATE_SCHEMA_VERSION_KEY,
  classifyLegacyShapes,
  toPersistedGameState,
} from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";
import { continuationOf, loadV2EndPhaseFixture, v2State } from "./fixtures/opt-962-v2-fixture.js";

const V2_NAMES = Object.keys(loadV2EndPhaseFixture().cases);

function golden(name: string) {
  const entry = loadGoldenFixture().cases[name];
  if (!entry) throw new Error(`no golden case named ${name}`);
  return {
    session: JSON.parse(entry.sessionJson) as Record<string, unknown> & { state: Record<string, unknown> },
    cardDb: JSON.parse(entry.cardDbJson) as Record<string, unknown>,
    undoHistory: JSON.parse(entry.undoHistoryJson) as Record<string, unknown>[],
  };
}

function storageWith(state: unknown, undoHistory: unknown[]): MemorySessionStorage {
  const base = golden("battle-ready-with-undo");
  const storage = new MemorySessionStorage();
  storage.data.set(SESSION_STORAGE_KEY, { ...base.session, state });
  storage.data.set(SESSION_CARD_DB_STORAGE_KEY, base.cardDb);
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, undoHistory);
  storage.writes.length = 0;
  return storage;
}

function repository(storage: MemorySessionStorage): SessionRepository {
  return new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
}

function withoutVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  return rest;
}

const lifecycleServices = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};

describe("OPT-980 v2 reader: every shape the PR 4b prototype writes", () => {
  it.each(V2_NAMES)("%s loads live with nothing dropped and the stage intact", (name) => {
    const raw = v2State(name);
    const loaded = convertPersistedGameState(raw, "state");
    // Nothing accepted is dropped: the runtime state is the stored object minus the envelope key.
    expect(withoutVersion(persistedV3(loaded))).toEqual(withoutVersion(raw));
    expect(loaded).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
  });

  it.each(V2_NAMES)("%s loads as an undo snapshot through the same hook", async (name) => {
    const live = golden("battle-ready-with-undo");
    const raw = v2State(name);
    const loaded = (await repository(storageWith(live.session.state, [raw])).load())!;
    expect(withoutVersion(persistedV3(loaded.undoHistory[0]))).toEqual(withoutVersion(raw));
  });

  it("covers every stage the writer can park in", () => {
    const stages = new Set(V2_NAMES.flatMap((name) => {
      const frame = v2State(name).effectStack.find((f) => f.phaseBoundaryContinuation);
      return frame ? [(frame.phaseBoundaryContinuation as { stage: string }).stage] : [];
    }));
    expect([...stages].sort()).toEqual([
      "END_OF_OPPONENT_TURN_WAVE",
      "END_OF_YOUR_TURN_WAVE",
      "LEGACY_SCHEDULED_ACTIONS",
      "NON_TURN_PLAYER_END_OF_TURN",
      "TURN_PLAYER_END_OF_TURN",
    ]);
  });

  it("classifies only the legacy stage as a legacy shape", () => {
    for (const name of V2_NAMES) {
      const state = convertPersistedGameState(v2State(name), "state");
      const shapes = classifyLegacyShapes(state).map((report) => report.shape);
      expect(shapes.includes("legacy.stage_less_phase_boundary"), name).toBe(name === "legacy-reparked");
    }
  });
});

describe("OPT-980 mixed-version undo history", () => {
  it("[1, 2]: a version 1 live state with a version 2 undo snapshot loads", async () => {
    const live = golden("battle-ready-with-undo");
    const loaded = (await repository(storageWith(live.session.state, [v2State("turn-completed")])).load())!;
    expect(loaded.state).toEqual({ ...convertPersistedGameState(live.session.state, "state"), schemaVersion: 7 });
    expect(loaded.undoHistory[0]).toEqual({ ...withoutVersion(v2State("turn-completed")), schemaVersion: 7 });
  });

  it("[2, 1]: a version 2 live state parked mid-wave with a version 1 undo snapshot loads", async () => {
    const v1Undo = golden("battle-ready-with-undo").undoHistory;
    const loaded = (await repository(storageWith(v2State("wave1-select-target"), v1Undo)).load())!;
    expect(continuationOf(loaded.state as never).stage).toBe("END_OF_YOUR_TURN_WAVE");
    expect(loaded.undoHistory[0]).toEqual({ ...convertPersistedGameState(v1Undo[0], "undoHistory[0]"), schemaVersion: 7 });
  });

  it("[2, 1] re-saved by the current writer: both objects are written as schemaVersion 7 and reload equal", async () => {
    const v1Undo = golden("battle-ready-with-undo").undoHistory;
    const first = (await repository(storageWith(v2State("step2-scheduled-prompt"), v1Undo)).load())!;
    const target = new MemorySessionStorage();
    const saved = await repository(target).save(first);
    const written = target.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
    expect(written.state[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(7);
    const writtenUndo = target.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as Record<string, unknown>[];
    expect(writtenUndo[0][GAME_STATE_SCHEMA_VERSION_KEY]).toBe(7);
    const second = (await repository(target).load())!;
    // `saved` is `first` plus the prompt id the writer assigns (ensurePromptId).
    expect(toPersistedGameState(second.state)).toEqual(toPersistedGameState(saved.state));
    expect(second.undoHistory.map(toPersistedGameState)).toEqual(saved.undoHistory.map(toPersistedGameState));
    expect(continuationOf(second.state as never)).toEqual(continuationOf(first.state as never));
  });
});

describe("OPT-980 v1 → v2 converter: stage-less frames become LEGACY_SCHEDULED_ACTIONS", () => {
  it("converts the base-written parked End Phase live and as undo, and changes nothing else", async () => {
    const raw = golden("end-phase-parked").session.state;
    const live = convertPersistedGameState(raw, "state");
    const asUndo = (await repository(storageWith(golden("battle-ready-with-undo").session.state, [raw])).load())!.undoHistory[0];
    for (const state of [live, asUndo]) {
      const frameIndex = state.effectStack.findIndex((f) => f.phaseBoundaryContinuation);
      const rawFrame = (raw.effectStack as Array<Record<string, unknown>>)[frameIndex];
      expect(state.effectStack[frameIndex].phaseBoundaryContinuation).toEqual({
        ...(rawFrame.phaseBoundaryContinuation as object),
        stage: "LEGACY_SCHEDULED_ACTIONS",
      });
    }
    // Everything outside the continuation is untouched.
    const stripped = {
      ...live,
      effectStack: live.effectStack.map((f) => {
        if (!f.phaseBoundaryContinuation) return f;
        const { stage: _stage, ...rest } = f.phaseBoundaryContinuation;
        return { ...f, phaseBoundaryContinuation: rest };
      }),
    };
    expect(stripped).toEqual(raw);
  });

  it("a stage-less paused End Phase resumes identically with and without the legacy stage (engine unchanged)", () => {
    const raw = golden("end-phase-parked");
    const cardDb = new Map(Object.entries(raw.cardDb) as Array<[string, never]>);
    const converted = convertPersistedGameState(raw.session.state, "state");
    const baseRuntime = structuredClone(raw.session.state) as unknown as GameState;
    const reply = { type: "SELECT_TARGET" as const, selectedInstanceIds: [], promptId: converted.pendingPrompt!.promptId };

    const head = resumePromptLifecycle(converted, reply, cardDb, lifecycleServices);
    const base = resumePromptLifecycle(baseRuntime, reply, cardDb, lifecycleServices);

    expect(head.responseRejected).toBe(false);
    expect(head.state.effectStack).toEqual([]);
    expect(head.state.turn.activePlayerIndex).toBe(1);
    expect(head).toEqual(base);
  });
});

describe("OPT-924 version 2 writer (now the version 3 writer, OPT-963)", () => {
  it("re-saving a converted legacy End Phase writes the base bytes plus the version key and the legacy stage, and reloads equal", async () => {
    const entry = loadGoldenFixture().cases["end-phase-parked"];
    const source = new MemorySessionStorage();
    source.data.set(SESSION_STORAGE_KEY, JSON.parse(entry.sessionJson));
    source.data.set(SESSION_CARD_DB_STORAGE_KEY, JSON.parse(entry.cardDbJson));
    source.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, JSON.parse(entry.undoHistoryJson));
    const loaded = (await repository(source).load())!;
    expect(continuationOf(loaded.state as never).stage).toBe("LEGACY_SCHEDULED_ACTIONS");

    const target = new MemorySessionStorage();
    await repository(target).save(loaded);
    const base = JSON.parse(entry.sessionJson) as { state: Record<string, unknown> & { effectStack: Array<Record<string, unknown>> } };
    const expectedState = structuredClone(base.state);
    (continuationOf(expectedState) as Record<string, unknown>).stage = "LEGACY_SCHEDULED_ACTIONS";
    const written = target.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
    expect(persistedV3(convertPersistedGameState(written.state, "state"))).toEqual({ [GAME_STATE_SCHEMA_VERSION_KEY]: 3, ...expectedState });
    expect(toPersistedGameState((await repository(target).load())!.state)).toEqual(toPersistedGameState(loaded.state));
  });

  it("labels every state, with or without an End Phase frame, as version 6", () => {
    const state = convertPersistedGameState(golden("fresh-setup").session.state, "state");
    const out = toPersistedGameState(state) as unknown as Record<string, unknown>;
    expect(Object.keys(out)[0]).toBe(GAME_STATE_SCHEMA_VERSION_KEY);
    expect(out[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(6);
    expect(persistedV3(convertPersistedGameState(out, "state"))).toEqual(persistedV3(state));
  });

  it("keeps the legacy and staged stages, and gives a stage-less runtime frame its legacy stage", () => {
    for (const name of ["legacy-reparked", "wave2-optional"]) {
      const state = convertPersistedGameState(v2State(name), "state");
      const out = toPersistedGameState(state) as unknown as Record<string, unknown>;
      expect(out[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(6);
      expect(persistedV3(convertPersistedGameState(out, "state"))).toEqual(persistedV3(state));
    }
    const legacy = convertPersistedGameState(v2State("legacy-reparked"), "state");
    const stageLess = {
      ...legacy,
      effectStack: legacy.effectStack.map((f) => {
        if (!f.phaseBoundaryContinuation) return f;
        const { stage: _stage, ...rest } = f.phaseBoundaryContinuation;
        return { ...f, phaseBoundaryContinuation: rest };
      }),
    };
    expect(persistedV3(convertPersistedGameState(toPersistedGameState(stageLess), "state"))).toEqual(persistedV3(legacy));
  });
});

describe("OPT-980 stage semantics are validated, with a located reason", () => {
  type Edit = (state: ReturnType<typeof v2State>) => void;
  const cases: Array<[string, string, Edit, RegExp]> = [
    ["an unknown stage", "wave1-select-target", (s) => { continuationOf(s).stage = "END_OF_EVERYTHING"; },
      /state has an invalid core shape at effectStack\.0\.phaseBoundaryContinuation\.stage/],
    ["a v2 frame without a stage", "wave1-select-target", (s) => { delete continuationOf(s).stage; },
      /state has an invalid core shape at effectStack\.0\.phaseBoundaryContinuation\.stage/],
    ["an unknown step", "step1-scheduled-prompt", (s) => { continuationOf(s).remainingScheduledActions[0].step = "BOTH_PLAYERS"; },
      /state has an invalid core shape at effectStack\.0\.phaseBoundaryContinuation\.remainingScheduledActions\.0\.step/],
    ["non-string activatedWaveEffects", "wave1-select-target", (s) => { continuationOf(s).activatedWaveEffects = [7]; },
      /state has an invalid core shape at effectStack\.0\.phaseBoundaryContinuation\.activatedWaveEffects\.0/],
    ["a legacy frame with activatedWaveEffects", "legacy-reparked", (s) => { continuationOf(s).activatedWaveEffects = []; },
      /effectStack\[0\] \(frame "[^"]+"\) has stage LEGACY_SCHEDULED_ACTIONS with activatedWaveEffects/],
    ["a legacy entry with a step", "legacy-reparked", (s) => { continuationOf(s).remainingScheduledActions[0].step = "TURN_PLAYER"; },
      /has stage LEGACY_SCHEDULED_ACTIONS with a step on remainingScheduledActions\[0\]/],
    ["a staged frame without activatedWaveEffects", "step1-scheduled-prompt", (s) => { delete continuationOf(s).activatedWaveEffects; },
      /has stage TURN_PLAYER_END_OF_TURN without activatedWaveEffects/],
    ["a staged entry without a step", "step1-scheduled-prompt", (s) => { delete continuationOf(s).remainingScheduledActions[0].step; },
      /has stage TURN_PLAYER_END_OF_TURN with an untagged remainingScheduledActions\[0\]/],
    ["a wave stage holding an obligation", "wave1-select-target", (s) => {
      continuationOf(s).remainingScheduledActions.push({ action: { type: "DRAW", params: { amount: 1 } }, controller: 0, sourceEffectId: "x", step: "TURN_PLAYER" });
    }, /has stage END_OF_YOUR_TURN_WAVE with 1 remaining scheduled action\(s\)/],
    ["step 1 holding the non-turn player's obligation", "step1-scheduled-prompt", (s) => { continuationOf(s).remainingScheduledActions[0].controller = 1; },
      /has stage TURN_PLAYER_END_OF_TURN but remainingScheduledActions\[0\] is step TURN_PLAYER for player 1; expected step TURN_PLAYER for player 0/],
    ["step 2 holding a step 1 tag", "step2-scheduled-prompt", (s) => { continuationOf(s).remainingScheduledActions[0].step = "TURN_PLAYER"; },
      /has stage NON_TURN_PLAYER_END_OF_TURN but remainingScheduledActions\[0\] is step TURN_PLAYER for player 1; expected step NON_TURN_PLAYER for player 1/],
    ["a staged frame outside the End Phase", "wave2-optional", (s) => { (s.turn as { phase: string }).phase = "MAIN"; },
      /parks an End Phase while turn\.phase is MAIN/],
    ["a staged frame whose ending player is not the turn player", "wave2-optional", (s) => { (s.turn as { activePlayerIndex: number }).activePlayerIndex = 1; },
      /has phaseBoundaryContinuation\.endingPlayerIndex 0 but turn\.activePlayerIndex is 1/],
  ];

  it.each(cases)("rejects %s", (_label, name, edit, message) => {
    const state = v2State(name);
    edit(state);
    expect(() => convertPersistedGameState(state, "state")).toThrow(message);
  });

  it.each([
    ["stage", (c: ReturnType<typeof continuationOf>) => { c.stage = "END_OF_YOUR_TURN_WAVE"; }, /carries stage, which no version 1 writer wrote/],
    ["activatedWaveEffects", (c: ReturnType<typeof continuationOf>) => { c.activatedWaveEffects = []; }, /carries activatedWaveEffects, which no version 1 writer wrote/],
    ["step", (c: ReturnType<typeof continuationOf>) => { c.remainingScheduledActions[0].step = "TURN_PLAYER"; }, /remainingScheduledActions\[0\] carries step, which no version 1 writer wrote/],
  ] as const)("rejects a version 1 object carrying %s, naming the undo entry", async (_key, edit, message) => {
    const raw = structuredClone(golden("end-phase-parked").session.state) as { effectStack: Array<Record<string, unknown>> };
    edit(continuationOf(raw));
    const storage = storageWith(golden("battle-ready-with-undo").session.state, [raw]);
    const before = JSON.stringify([...storage.data.entries()]);
    await expect(repository(storage).load()).rejects.toMatchObject({
      name: "SessionLoadError",
      location: "undoHistory[0]",
      message: expect.stringMatching(message),
    });
    expect(JSON.stringify([...storage.data.entries()])).toBe(before);
    expect(storage.writes).toEqual([]);
  });
});
