/**
 * OPT-940 reader: version dispatch, legacy round-trip, mixed undo, controlled
 * failure on unsupported versions, deterministic repeat loads, and no partial
 * mutation on a failed load.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §1, §5.
 */

import { describe, expect, it } from "vitest";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
  convertPersistedGameState,
  parseStoredSession,
} from "../session/persistence.js";
import {
  GAME_STATE_SCHEMA_VERSION,
  GAME_STATE_SCHEMA_VERSION_KEY,
  LEGACY_GAME_STATE_SCHEMA_VERSION,
  SUPPORTED_GAME_STATE_SCHEMA_VERSIONS,
  SessionLoadError,
  readGameStateSchemaVersion,
} from "../session/game-state-schema.js";
import type { GameState } from "../types.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { getSyntheticStates, loadGoldenFixture } from "./fixtures/opt-940-golden.js";

type StoredSessionValue = Record<string, unknown> & { state: Record<string, unknown> };

function goldenStorage(name: string): MemorySessionStorage {
  const golden = loadGoldenFixture().cases[name];
  if (!golden) throw new Error(`no golden case named ${name}`);
  const storage = new MemorySessionStorage();
  storage.data.set(SESSION_STORAGE_KEY, JSON.parse(golden.sessionJson));
  storage.data.set(SESSION_CARD_DB_STORAGE_KEY, JSON.parse(golden.cardDbJson));
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, JSON.parse(golden.undoHistoryJson));
  storage.writes.length = 0;
  return storage;
}

function repository(storage: MemorySessionStorage): SessionRepository {
  return new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  });
}

function storedBytes(storage: MemorySessionStorage): Record<string, string> {
  return Object.fromEntries(
    [SESSION_STORAGE_KEY, SESSION_CARD_DB_STORAGE_KEY, SESSION_UNDO_HISTORY_STORAGE_KEY].map(
      (key) => [key, JSON.stringify(storage.data.get(key))]
    )
  );
}

function sessionValue(storage: MemorySessionStorage): StoredSessionValue {
  return storage.data.get(SESSION_STORAGE_KEY) as StoredSessionValue;
}

function undoValue(storage: MemorySessionStorage): Record<string, unknown>[] {
  return storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as Record<string, unknown>[];
}

/** The OPT-980 v1 → v2 conversion of a stage-less End Phase frame, applied to an expected runtime state. */
function withLegacyStage(state: GameState): GameState {
  if (!state.effectStack.some((frame) => frame.phaseBoundaryContinuation)) return state;
  return {
    ...state,
    effectStack: state.effectStack.map((frame) =>
      frame.phaseBoundaryContinuation
        ? { ...frame, phaseBoundaryContinuation: { ...frame.phaseBoundaryContinuation, stage: "LEGACY_SCHEDULED_ACTIONS" } }
        : frame
    ),
  };
}

describe("OPT-940 game-state schema version", () => {
  it("defines version 1 and assigns it to a persisted object without the key", () => {
    // OPT-980 reads 1 and 2; OPT-924 (PR 4b) writes 2; OPT-963 reads 3 (PR 5a) and writes 3 (PR 5b).
    expect(GAME_STATE_SCHEMA_VERSION).toBe(6);
    expect(LEGACY_GAME_STATE_SCHEMA_VERSION).toBe(1);
    expect([...SUPPORTED_GAME_STATE_SCHEMA_VERSIONS]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(readGameStateSchemaVersion({}, "state")).toBe(1);
    expect(readGameStateSchemaVersion({ [GAME_STATE_SCHEMA_VERSION_KEY]: 1 }, "state")).toBe(1);
  });

  it.each([
    ["a string", "1"],
    ["zero", 0],
    ["negative", -1],
    ["a fraction", 1.5],
    ["null", null],
  ])("rejects %s as a version with an actionable error", (_label, value) => {
    expect(() =>
      readGameStateSchemaVersion({ [GAME_STATE_SCHEMA_VERSION_KEY]: value }, "undoHistory[0]")
    ).toThrow(
      `Stored session undoHistory[0] has an invalid game-state schema version ${JSON.stringify(value)}`
    );
  });

  it("rejects a newer version and tells the operator to roll forward", () => {
    expect(readGameStateSchemaVersion({ [GAME_STATE_SCHEMA_VERSION_KEY]: 3 }, "state")).toBe(3);
    expect(() => readGameStateSchemaVersion({ [GAME_STATE_SCHEMA_VERSION_KEY]: 8 }, "state")).toThrow(
      "Stored session state has unsupported game-state schema version 8 (written by a newer build; roll forward to a build that reads it); this build supports 1, 2, 3, 4, 5, 6, 7"
    );
  });
});

describe("OPT-940 reader: legacy live and undo snapshots round-trip", () => {
  const names = getSyntheticStates().map((state) => state.name);

  // end-phase-parked: the base bytes hold a stage-less frame; the OPT-924
  // engine now builds a staged End Phase from the same input, so the two are
  // compared in opt-980-end-phase-stage-reader.test.ts and the writer golden
  // instead of here. The six OPT-963 cases hold version 2 records that the
  // reader lifts into frames (opt-963-v3-reader.test.ts pins the lift).
  const LIFTED = new Set(["structural-resume-context", "end-phase-parked", "battle-trigger-window", "both-trigger-windows", "effect-damage-trigger-window", "replacement-prompt", "replacement-batch-prompt", "stuck-damage-step"]);
  it.each(names.filter((name) => !LIFTED.has(name)))("%s: bytes written at the base commit load to the state the writer saved", async (name) => {
    const entry = getSyntheticStates().find((state) => state.name === name)!;
    const saved = await repository(new MemorySessionStorage()).save(entry.snapshot);

    const loaded = await repository(goldenStorage(name)).load();
    expect(loaded).not.toBeNull();
    // OPT-980: the only conversion is the legacy stage on a stage-less End Phase frame.
    expect(loaded!.state).toEqual(withLegacyStage(saved.state));
    expect(loaded!.undoHistory).toEqual(saved.undoHistory.map(withLegacyStage));
    expect(loaded!.cardDb).toEqual(saved.cardDb);
    expect(loaded!.state).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
  });

  it("accepts an explicit schemaVersion 1 on the live state and strips the envelope key", async () => {
    const storage = goldenStorage("effect-frame-prompt");
    const reference = (await repository(goldenStorage("effect-frame-prompt")).load())!;
    sessionValue(storage).state[GAME_STATE_SCHEMA_VERSION_KEY] = 1;

    const loaded = (await repository(storage).load())!;
    expect(loaded.state).toEqual(reference.state);
    expect(loaded.state).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
  });

  it("loads mixed undo history: a version-less live state with an explicitly versioned undo snapshot", async () => {
    const storage = goldenStorage("battle-ready-with-undo");
    const reference = (await repository(goldenStorage("battle-ready-with-undo")).load())!;
    undoValue(storage)[0][GAME_STATE_SCHEMA_VERSION_KEY] = 1;

    const loaded = (await repository(storage).load())!;
    expect(loaded.undoHistory).toHaveLength(1);
    expect(loaded.undoHistory[0]).toEqual(reference.undoHistory[0]);
    expect(loaded.undoHistory[0]).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
  });

  it("loads the same stored session twice to deep-equal, byte-equal snapshots", async () => {
    const storage = goldenStorage("end-phase-parked");
    const first = (await repository(storage).load())!;
    const second = (await repository(storage).load())!;
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(storage.writes).toEqual([]);
  });
});

describe("OPT-940 reader: controlled failure", () => {
  it("rejects an unsupported version on the live state without touching storage", async () => {
    const storage = goldenStorage("fresh-setup");
    sessionValue(storage).state[GAME_STATE_SCHEMA_VERSION_KEY] = 8;
    const before = storedBytes(storage);
    const repo = repository(storage);

    await expect(repo.load()).rejects.toMatchObject({
      name: "SessionLoadError",
      location: "state",
      message: expect.stringContaining("unsupported game-state schema version 8"),
    });
    expect(storedBytes(storage)).toEqual(before);
    expect(storage.writes).toEqual([]);
    expect(repo.getLastMetrics()).toBeNull();
  });

  it("rejects an unsupported version on an undo snapshot, naming the entry", async () => {
    const storage = goldenStorage("battle-ready-with-undo");
    undoValue(storage)[0][GAME_STATE_SCHEMA_VERSION_KEY] = 99;
    await expect(repository(storage).load()).rejects.toMatchObject({
      location: "undoHistory[0]",
      message: expect.stringContaining("Stored session undoHistory[0] has unsupported game-state schema version 99"),
    });
  });

  it("rejects a corrupt undo snapshot with the entry and reason, and leaves all three values byte-identical", async () => {
    const storage = goldenStorage("battle-ready-with-undo");
    const undo = undoValue(storage)[0];
    undo.futureField = { stage: "END_PHASE_WAVE_1" };
    const before = storedBytes(storage);
    const repo = repository(storage);
    const summaryBefore = repo.getHistorySummary();

    const error = await repo.load().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SessionLoadError);
    expect((error as SessionLoadError).location).toBe("undoHistory[0]");
    expect((error as SessionLoadError).message).toBe(
      'Stored session undoHistory[0] has an invalid core shape at state: Unrecognized key: "futureField"'
    );

    expect(storedBytes(storage)).toEqual(before);
    expect(storage.writes).toEqual([]);
    expect(repo.getLastMetrics()).toBeNull();
    expect(repo.getHistorySummary()).toEqual(summaryBefore);
  });

  it("never reinterprets a version 2 field on a version 1 object (a stage is rejected, not dropped or trusted)", () => {
    const stored = JSON.parse(loadGoldenFixture().cases["end-phase-parked"].sessionJson) as StoredSessionValue;
    const frames = stored.state.effectStack as Array<Record<string, unknown>>;
    const phaseFrame = frames.find((frame) => frame.phaseBoundaryContinuation) as {
      phaseBoundaryContinuation: Record<string, unknown>;
    };
    phaseFrame.phaseBoundaryContinuation.stage = "LEGACY_SCHEDULED_ACTIONS";

    expect(() => convertPersistedGameState(stored.state, "state")).toThrow(
      /Stored session state effectStack\[\d+\]\.phaseBoundaryContinuation carries stage, which no version 1 writer wrote/
    );
  });

  it("keeps the pre-change error prefixes for the live state", () => {
    const stored = JSON.parse(loadGoldenFixture().cases["fresh-setup"].sessionJson) as StoredSessionValue;
    const cardDb = JSON.parse(loadGoldenFixture().cases["fresh-setup"].cardDbJson);
    (stored.state as { eventLog: unknown[] }).eventLog = [{ type: "NOT_AN_EVENT", playerIndex: 0, timestamp: 1, payload: {} }];
    expect(() => parseStoredSession(stored, cardDb, [])).toThrow("Stored session state contains an unknown event variant");
  });
});
