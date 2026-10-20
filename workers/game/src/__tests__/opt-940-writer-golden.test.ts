/**
 * OPT-940 writer-unchanged proof.
 *
 * The persistence writer must emit byte-identical output before and after
 * the reader-only PR 1. The golden fixture was captured through the writer
 * at the base commit by scripts/capture-writer-golden.ts; this test
 * re-serializes the same synthetic states through the current writer and
 * compares the exact JSON of every stored value.
 *
 * Re-capture the fixture only in a PR that deliberately changes the writer
 * (a game-state schema version bump).
 *
 * OPT-924 (PR 4b of OPT-962) raised the writer to version 2; OPT-963 (PR 5b)
 * raises it to version 3: the replacement and damage continuations are typed
 * frames. The version 1 and version 2 goldens stay frozen as reader input;
 * this test compares against opt-963-writer-golden.synthetic.json and pins
 * how it differs from the version 2 golden: the `schemaVersion: 3` key on the
 * live state and every undo snapshot, plus the six cases whose records are
 * now frames.
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
import { getSyntheticStates, loadGoldenFixture, loadV2WriterGolden, loadWriterGolden, loadV4WriterGolden } from "./fixtures/opt-940-golden.js";

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

describe("OPT-940 writer golden: persisted bytes match the current (version 4) writer golden", () => {
  const fixture = loadV4WriterGolden();
  const v3 = loadWriterGolden();
  const v1 = loadGoldenFixture();
  const v2 = loadV2WriterGolden();

  it("was captured from the same synthetic states and is labelled synthetic", () => {
    expect(fixture.provenance).toBe("synthetic");
    expect(Object.keys(fixture.cases).sort()).toEqual(
      getSyntheticStates().map((state) => state.name).sort()
    );
    expect(Object.keys(fixture.cases).sort()).toEqual(Object.keys(v1.cases).sort());
  });

  it.each(Object.keys(fixture.cases))(
    "%s: session, card DB, and undo history bytes match the writer golden",
    async (name) => {
      const golden = fixture.cases[name];
      const current = await writeThroughCurrentWriter(name);
      expect(current.sessionJson).toBe(golden.sessionJson);
      expect(current.cardDbJson).toBe(golden.cardDbJson);
      expect(current.undoHistoryJson).toBe(golden.undoHistoryJson);
    }
  );

  it("writes schemaVersion 4 first on the live state and every undo snapshot", async () => {
    for (const name of Object.keys(fixture.cases)) {
      const current = await writeThroughCurrentWriter(name);
      expect(current.sessionJson, name).toContain(`"state":{"${GAME_STATE_SCHEMA_VERSION_KEY}":4,`);
      const undo = JSON.parse(current.undoHistoryJson) as Array<Record<string, unknown>>;
      for (const snapshot of undo) expect(Object.keys(snapshot)[0], name).toBe(GAME_STATE_SCHEMA_VERSION_KEY);
      for (const snapshot of undo) expect(snapshot[GAME_STATE_SCHEMA_VERSION_KEY], name).toBe(4);
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
    const state = (JSON.parse(v3.cases[name].sessionJson) as { state: Record<string, unknown> }).state;
    const frames = state.effectStack as Array<Record<string, unknown>>;
    expect(frames.some((frame) => frame.battleDamage || frame.effectDamage || frame.replacement || frame.replacementBatch)).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/pendingTriggerLifeCard|pendingTriggerFromEffect|pendingBattleDamageContinuation|replacementBatchContinuation/);
  });
});
