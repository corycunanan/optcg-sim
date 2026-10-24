import { describe, expect, it } from "vitest";
import { endPhaseRig } from "./opt-962-rig.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { SessionRepository, SESSION_STORAGE_KEY, SESSION_UNDO_HISTORY_STORAGE_KEY } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type { GameState } from "../types.js";
const config = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
function historical(version: 6 | 7 | 8, mode: 6 | 7) {
  const r = endPhaseRig();
  r.state.schemaVersion = version;
  if (version === 8) r.state.costSemanticsVersion = mode;
  else delete r.state.costSemanticsVersion;
  return r;
}

describe.each([[6, 6], [7, 7], [8, 6], [8, 7]] as const)("writer source v%s mode%s", (version, mode) => {
  it.each([false, true])("validates and activates live and all undo entries before gameplay (embedded=%s)", async embedded => {
    const r = historical(version, mode);
    const wire = toPersistedGameState(r.state);
    const original = structuredClone(wire);
    const storage = new MemorySessionStorage();
    const undo = [wire, structuredClone(wire), structuredClone(wire)];
    storage.data.set(SESSION_STORAGE_KEY, {
      formatVersion: 2, state: wire, cardDb: Object.fromEntries(r.db),
      ...(embedded ? { undoHistory: undo } : {}),
    });
    if (!embedded) storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, undo);
    const loaded = (await new SessionRepository(storage, config).load())!;
    // The retained undo limit is one; validation must still visit every input.
    for (const state of [loaded.state, ...loaded.undoHistory])
      expect(state).toEqual({ ...original, schemaVersion: 8, costSemanticsVersion: mode });
    expect(wire).toEqual(original);
    const result = new SessionCoordinator().executeAction(loaded.state, [], 0, { type: "ATTACH_DON", targetInstanceId: loaded.state.players[0].leader.instanceId, count: 1 }, loaded.cardDb);
    expect(result.kind).toBe("applied");
    expect(result.state.schemaVersion).toBe(8);
    expect(result.state.costSemanticsVersion).toBe(mode);
    const invalid = structuredClone(undo); invalid[2].schemaVersion = 8;
    delete invalid[2].costSemanticsVersion;
    const bad = structuredClone(storage.data.get(SESSION_STORAGE_KEY)) as { undoHistory?: GameState[] };
    if (embedded) bad.undoHistory = invalid;
    storage.data.set(SESSION_STORAGE_KEY, bad);
    if (!embedded) storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, invalid);
    await expect(new SessionRepository(storage, config).load()).rejects.toThrow(/undoHistory\[2\]/);
  });

  it("save returns the same writer semantics as storage before the next action, with no allocator or cost evidence invented", async () => {
    const r = historical(version, mode);
    const before = structuredClone(r.state);
    const storage = new MemorySessionStorage();
    const saved = await new SessionRepository(storage, config).save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [r.state] });
    expect(saved.state).toEqual({ ...before, schemaVersion: 8, costSemanticsVersion: mode });
    expect(saved.undoHistory).toEqual([saved.state]);
    expect((storage.data.get(SESSION_STORAGE_KEY) as { state: GameState }).state).toEqual(toPersistedGameState(saved.state));
    expect((storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as GameState[])[0]).toEqual(toPersistedGameState(saved.state));
    expect(r.state).toEqual(before);
    const result = new SessionCoordinator().executeAction(saved.state, saved.undoHistory, 0, { type: "ATTACH_DON", targetInstanceId: saved.state.players[0].leader.instanceId, count: 1 }, r.db);
    expect(result.kind).toBe("applied");
    expect(result.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: mode });
  });

  it("typed historical rejected actions preserve live and undo bytes and references", () => {
    const r = historical(version, mode);
    const before = structuredClone(r.state);
    const history = [structuredClone(r.state)];
    const result = new SessionCoordinator().executeAction(r.state, history, 1, { type: "ADVANCE_PHASE" }, r.db);
    expect(result.kind).toBe("reject");
    expect(result.state).toBe(r.state);
    expect(result.undoHistory[0]).toBe(history[0]);
    expect(r.state).toEqual(before);
  });
});

it("rejects missing or invalid explicit8 provenance instead of defaulting it", async () => {
  for (const mode of [undefined, 5, "6"]) {
    const r = historical(8, 6);
    Object.assign(r.state, { costSemanticsVersion: mode });
    const storage = new MemorySessionStorage();
    await expect(new SessionRepository(storage, config).save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] })).rejects.toThrow(/costSemanticsVersion/);
    expect(storage.data.size).toBe(0);
    expect(new SessionCoordinator().executeAction(r.state, [], 0, { type: "ADVANCE_PHASE" }, r.db).kind).toBe("reject");
  }
});

it.each(["live", "undo"])("production %s load rejects malformed persisted kinds before promotion", async ingress => {
  const { getSyntheticStates } = await import("./fixtures/opt-940-golden.js");
  const entry = getSyntheticStates().find(e => e.snapshot.state.effectStack.length > 0)!;
  const state = toPersistedGameState(entry.snapshot.state);
  const malformed = structuredClone(state);
  malformed.effectStack[0].kind = malformed.effectStack[0].kind === "EFFECT" ? "TRIGGER_DRAIN" : "EFFECT";
  const storage = new MemorySessionStorage();
  storage.data.set(SESSION_STORAGE_KEY, { formatVersion: 2, state: ingress === "live" ? malformed : state, cardDb: Object.fromEntries(entry.snapshot.cardDb) });
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, [ingress === "undo" ? malformed : state]);
  const before = structuredClone([...storage.data]);
  await expect(new SessionRepository(storage, config).load()).rejects.toThrow(/kind|frame|continuation/i);
  expect([...storage.data]).toEqual(before);
});
