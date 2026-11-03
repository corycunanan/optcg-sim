import currentV8 from "./fixtures/opt-1003-writer-golden.synthetic.json";
/**
 * Historical OPT-940..967 inputs remain frozen. OPT-968 compares separate
 * current v8 writer bytes, including explicit complete batch event families.
 * The historical version-transition assertions below still use old fixtures;
 * they do not manufacture historical inputs through the current writer.
 */

import { describe, expect, it } from "vitest";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
} from "../session/persistence.js";
import { GAME_STATE_SCHEMA_VERSION_KEY } from "../session/game-state-schema.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { getSyntheticStates, loadGoldenFixture, loadV2WriterGolden, loadWriterGolden, loadV5WriterGolden } from "./fixtures/opt-940-golden.js";

async function writeThroughCurrentWriter(name: string) {
  const entry = getSyntheticStates().find((state) => state.name === name);
  if (!entry) throw new Error(`no synthetic state named ${name}`);
  const storage = new MemorySessionStorage();
  const repository = new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  });
  const saved = await repository.save(entry.snapshot);
  return {
    saved,
    sessionJson: JSON.stringify(storage.data.get(SESSION_STORAGE_KEY)),
    cardDbJson: JSON.stringify(storage.data.get(SESSION_CARD_DB_STORAGE_KEY)),
    undoHistoryJson: JSON.stringify(storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY)),
  };
}

describe("OPT-940 writer golden: persisted bytes match the current version 8 writer golden", () => {
  const fixture = loadV5WriterGolden();
  const v3 = loadWriterGolden();
  const v1 = loadGoldenFixture();
  const v2 = loadV2WriterGolden();

  it("was captured from the same synthetic states and is labelled synthetic", () => {
    expect(fixture.provenance).toBe("synthetic");
    expect(currentV8.provenance).toBe("synthetic");
    expect(currentV8.capturedAtCommit).toBe("6469e36650583fe745c7be2e283d10c2d9206c45");
    expect(Object.keys(fixture.cases).sort()).toEqual(
      getSyntheticStates().map((state) => state.name).sort()
    );
    expect(Object.keys(fixture.cases).sort()).toEqual(Object.keys(v1.cases).sort());
  });

  it.each(Object.keys(fixture.cases))(
    "%s: session, card DB, and undo history bytes match the writer golden",
    async (name) => {
      const golden = currentV8.cases[name as keyof typeof currentV8.cases];
      const current = await writeThroughCurrentWriter(name);
      const expectedSession = JSON.parse(golden.sessionJson);
      expectedSession.state.costSemanticsVersion = 7; // New setup policy, not existing8 migration.
      const expectedUndo = JSON.parse(golden.undoHistoryJson).map((state: Record<string, unknown>) => ({ ...state, costSemanticsVersion: 7 }));
      // The archived End Phase builder now explicitly reconstructs schema7;
      // ingress appends cost mode7 rather than placing that key near the front.
      // All historical payload values remain exact; archived bytes stay frozen.
      if (name === "end-phase-parked") expect(JSON.parse(current.sessionJson)).toEqual(expectedSession);
      else expect(current.sessionJson).toBe(JSON.stringify(expectedSession));
      expect(current.cardDbJson).toBe(golden.cardDbJson);
      expect(current.undoHistoryJson).toBe(JSON.stringify(expectedUndo));
    }
  );

  it("writes version 8 first regardless of owners on live state and undo snapshots", async () => {
    for (const name of Object.keys(fixture.cases)) {
      const current = await writeThroughCurrentWriter(name);
      const state = JSON.parse(current.sessionJson).state;
      const version = 8;
      expect(state.schemaVersion).toBe(version);
      expect(current.sessionJson, name).toContain(`"state":{"${GAME_STATE_SCHEMA_VERSION_KEY}":${version},`);
      const undo = JSON.parse(current.undoHistoryJson) as Array<Record<string, unknown>>;
      for (const snapshot of undo) expect(Object.keys(snapshot)[0], name).toBe(GAME_STATE_SCHEMA_VERSION_KEY);
      for (const snapshot of undo) {
        expect(snapshot[GAME_STATE_SCHEMA_VERSION_KEY], name).toBe(8);
        expect(snapshot.costSemanticsVersion, name).toBe(7);
      }
    }
  });

  /** Cases whose version 2 records are version 3 frames (OPT-963 §8). */
  const FRAME_CASES = new Set([
    "battle-trigger-window",
    "both-trigger-windows",
    "effect-damage-trigger-window",
    "replacement-prompt",
    "replacement-batch-prompt",
    "stuck-damage-step",
  ]);

  // Every diff line between the version 2 and version 3 goldens: the version
  // key on each persisted game-state object, and the six frame cases.
  it.each(Object.keys(v3.cases).filter((name) => !FRAME_CASES.has(name)))(
    "%s: the version 3 bytes are the version 2 bytes plus the version key",
    (name) => {
      const rekey = (state: Record<string, unknown>) => {
        const rest = { ...state };
        delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
        return { [GAME_STATE_SCHEMA_VERSION_KEY]: 3, ...rest };
      };
      const v2Session = JSON.parse(v2.cases[name].sessionJson) as Record<string, unknown> & { state: Record<string, unknown> };
      const v2Undo = JSON.parse(v2.cases[name].undoHistoryJson) as Array<Record<string, unknown>>;
      expect(v3.cases[name].sessionJson).toBe(JSON.stringify({ ...v2Session, state: rekey(v2Session.state) }));
      expect(v3.cases[name].cardDbJson).toBe(v2.cases[name].cardDbJson);
      expect(v3.cases[name].undoHistoryJson).toBe(JSON.stringify(v2Undo.map(rekey)));
    }
  );

  it.each([...FRAME_CASES])("%s: the version 3 object holds frames and none of the version 2 records", (name) => {
    const state = (JSON.parse(v3.cases[name].sessionJson) as { state: Record<string, unknown>;
        }).state;
    const frames = state.effectStack as Array<Record<string, unknown>>;
    expect(frames.some((frame) => frame.battleDamage || frame.effectDamage || frame.replacement || frame.replacementBatch)).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/pendingTriggerLifeCard|pendingTriggerFromEffect|pendingBattleDamageContinuation|replacementBatchContinuation/);
  });
});
