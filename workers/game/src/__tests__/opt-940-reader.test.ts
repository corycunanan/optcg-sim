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
import {
  MemorySessionStorage,
  buildSyntheticSessionStates,
} from "./fixtures/opt-940-synthetic-states.js";
import { loadGoldenFixture } from "./opt-940-writer-golden.test.js";

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

describe("OPT-940 game-state schema version", () => {
  it("defines version 1 and assigns it to a persisted object without the key", () => {
    expect(GAME_STATE_SCHEMA_VERSION).toBe(1);
    expect(LEGACY_GAME_STATE_SCHEMA_VERSION).toBe(1);
    expect([...SUPPORTED_GAME_STATE_SCHEMA_VERSIONS]).toEqual([1]);
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
    expect(() => readGameStateSchemaVersion({ [GAME_STATE_SCHEMA_VERSION_KEY]: 2 }, "state")).toThrow(
      "Stored session state has unsupported game-state schema version 2 (written by a newer build; roll forward to a build that reads it); this build supports 1"
    );
  });
});

describe("OPT-940 reader: legacy live and undo snapshots round-trip", () => {
  const names = buildSyntheticSessionStates().map((state) => state.name);

  it.each(names)("%s: bytes written at the base commit load to the state the writer saved", async (name) => {
    const entry = buildSyntheticSessionStates().find((state) => state.name === name)!;
    const saved = await repository(new MemorySessionStorage()).save(entry.snapshot);

    const loaded = await repository(goldenStorage(name)).load();
    expect(loaded).not.toBeNull();
    expect(loaded!.state).toEqual(saved.state);
    expect(loaded!.undoHistory).toEqual(saved.undoHistory);
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
    sessionValue(storage).state[GAME_STATE_SCHEMA_VERSION_KEY] = 2;
    const before = storedBytes(storage);
    const repo = repository(storage);

    await expect(repo.load()).rejects.toMatchObject({
      name: "SessionLoadError",
      location: "state",
      message: expect.stringContaining("unsupported game-state schema version 2"),
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

  it("never discards an unknown field to make parsing succeed (a future End Phase stage is rejected, not dropped)", () => {
    const stored = JSON.parse(loadGoldenFixture().cases["end-phase-parked"].sessionJson) as StoredSessionValue;
    const frames = stored.state.effectStack as Array<Record<string, unknown>>;
    const phaseFrame = frames.find((frame) => frame.phaseBoundaryContinuation) as {
      phaseBoundaryContinuation: Record<string, unknown>;
    };
    phaseFrame.phaseBoundaryContinuation.stage = "LEGACY_SCHEDULED_ACTIONS";

    expect(() => convertPersistedGameState(stored.state, "state")).toThrow(
      /Stored session state has an invalid core shape at effectStack\.\d+\.phaseBoundaryContinuation: Unrecognized key: "stage"/
    );
  });

  it("keeps the pre-change error prefixes for the live state", () => {
    const stored = JSON.parse(loadGoldenFixture().cases["fresh-setup"].sessionJson) as StoredSessionValue;
    const cardDb = JSON.parse(loadGoldenFixture().cases["fresh-setup"].cardDbJson);
    (stored.state as { eventLog: unknown[] }).eventLog = [{ type: "NOT_AN_EVENT", playerIndex: 0, timestamp: 1, payload: {} }];
    expect(() => parseStoredSession(stored, cardDb, [])).toThrow("Stored session state contains an unknown event variant");
  });
});
