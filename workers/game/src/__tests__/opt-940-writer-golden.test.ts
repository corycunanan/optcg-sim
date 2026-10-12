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
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
} from "../session/persistence.js";
import { GAME_STATE_SCHEMA_VERSION_KEY } from "../session/game-state-schema.js";
import {
  MemorySessionStorage,
  buildSyntheticSessionStates,
} from "./fixtures/opt-940-synthetic-states.js";

const BASE_COMMIT = "03071b6914c36349d0e81930a6f80bb530c713d9";

interface GoldenFixture {
  provenance: string;
  capturedAtCommit: string;
  cases: Record<
    string,
    { shape: string; sessionJson: string; cardDbJson: string; undoHistoryJson: string }
  >;
}

export function loadGoldenFixture(): GoldenFixture {
  return JSON.parse(
    readFileSync(
      resolve(__dirname, "fixtures/opt-940-writer-golden.synthetic.json"),
      "utf8"
    )
  ) as GoldenFixture;
}

async function writeThroughCurrentWriter(name: string) {
  const entry = buildSyntheticSessionStates().find((state) => state.name === name);
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

describe("OPT-940 writer golden: persisted bytes are unchanged by the reader PR", () => {
  const fixture = loadGoldenFixture();

  it("was captured through the writer at the base commit and is labelled synthetic", () => {
    expect(fixture.capturedAtCommit).toBe(BASE_COMMIT);
    expect(fixture.provenance).toBe("synthetic");
    expect(Object.keys(fixture.cases).sort()).toEqual(
      buildSyntheticSessionStates().map((state) => state.name).sort()
    );
  });

  it.each(Object.keys(fixture.cases))(
    "%s: session, card DB, and undo history bytes match the base writer",
    async (name) => {
      const golden = fixture.cases[name];
      const current = await writeThroughCurrentWriter(name);
      expect(current.sessionJson).toBe(golden.sessionJson);
      expect(current.cardDbJson).toBe(golden.cardDbJson);
      expect(current.undoHistoryJson).toBe(golden.undoHistoryJson);
    }
  );

  it("never writes the game-state schema version key in version 1", async () => {
    for (const name of Object.keys(fixture.cases)) {
      const current = await writeThroughCurrentWriter(name);
      expect(current.sessionJson).not.toContain(`"${GAME_STATE_SCHEMA_VERSION_KEY}"`);
      expect(current.undoHistoryJson).not.toContain(`"${GAME_STATE_SCHEMA_VERSION_KEY}"`);
    }
  });
});
