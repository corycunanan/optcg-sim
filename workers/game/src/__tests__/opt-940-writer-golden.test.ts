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
 * OPT-924 (PR 4b of OPT-962) is that PR: the writer emits version 2. The
 * version 1 golden stays frozen as base-writer reader input; this test now
 * compares against opt-962-writer-golden.synthetic.json, and pins how the two
 * differ: the `schemaVersion: 2` key on the live state and every undo
 * snapshot, plus the End Phase frame the new engine builds.
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
import { getSyntheticStates, loadGoldenFixture, loadWriterGolden } from "./fixtures/opt-940-golden.js";

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

describe("OPT-940 writer golden: persisted bytes match the current (version 2) writer golden", () => {
  const fixture = loadWriterGolden();
  const v1 = loadGoldenFixture();

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

  it("writes schemaVersion 2 first on the live state and every undo snapshot", async () => {
    for (const name of Object.keys(fixture.cases)) {
      const current = await writeThroughCurrentWriter(name);
      expect(current.sessionJson, name).toContain(`"state":{"${GAME_STATE_SCHEMA_VERSION_KEY}":2,`);
      const undo = JSON.parse(current.undoHistoryJson) as Array<Record<string, unknown>>;
      for (const snapshot of undo) expect(Object.keys(snapshot)[0], name).toBe(GAME_STATE_SCHEMA_VERSION_KEY);
      for (const snapshot of undo) expect(snapshot[GAME_STATE_SCHEMA_VERSION_KEY], name).toBe(2);
    }
  });

  // Every diff line between the version 1 and version 2 goldens: the version
  // key on each persisted game-state object. The only other difference is
  // end-phase-parked, whose state the new engine builds (a staged End Phase
  // frame instead of a stage-less one; PR body "Persisted shape").
  it.each(Object.keys(fixture.cases).filter((name) => name !== "end-phase-parked"))(
    "%s: the version 2 bytes are the version 1 bytes plus the version key",
    (name) => {
      const keyed = (state: Record<string, unknown>) => ({ [GAME_STATE_SCHEMA_VERSION_KEY]: 2, ...state });
      const v1Session = JSON.parse(v1.cases[name].sessionJson) as Record<string, unknown> & { state: Record<string, unknown> };
      const v1Undo = JSON.parse(v1.cases[name].undoHistoryJson) as Array<Record<string, unknown>>;
      expect(fixture.cases[name].sessionJson).toBe(JSON.stringify({ ...v1Session, state: keyed(v1Session.state) }));
      expect(fixture.cases[name].cardDbJson).toBe(v1.cases[name].cardDbJson);
      expect(fixture.cases[name].undoHistoryJson).toBe(JSON.stringify(v1Undo.map(keyed)));
    }
  );
});
