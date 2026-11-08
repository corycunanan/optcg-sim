/**
 * OPT-1013: read-only admission of the two OPT-971 captured terminal saves
 * that predate the persisted execution context and the full pregame record,
 * plus the boundaries that keep every other pre-context save rejected.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §4.2.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SESSION_STORAGE_KEY,
  SessionRepository,
  convertPersistedGameState,
  parseStoredSession,
} from "../session/persistence.js";
import { SessionLoadError } from "../session/game-state-schema.js";
import {
  createDeterministicExecutionContext,
  maxEngineIdCounter,
} from "../engine/execution-context.js";
import type { GameState } from "../types.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

const directory = new URL("./fixtures/opt-971-captured/", import.meta.url);
const digest = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", directory), "utf8")
) as { cases: { file: string; sha256: string; status: string }[] };

type RawState = Record<string, unknown> & {
  id: string;
  status: string;
  pregame?: Record<string, unknown> | null;
};

function capture(file: string): RawState {
  const bytes = readFileSync(new URL(file, directory));
  const entry = manifest.cases.find((candidate) => candidate.file === file);
  expect(digest(bytes)).toBe(entry?.sha256);
  return (JSON.parse(bytes.toString("utf8")) as { state: RawState }).state;
}

const ABANDONED = "capture-01.json";
const FINISHED = "capture-06.json";
const REASON = "only terminal saves with no paused work are admitted";

describe("OPT-1013 pre-context terminal admission: captured saves", () => {
  it.each(manifest.cases)("$file loads read-only with only the documented fills", (entry) => {
    const raw = capture(entry.file);
    const before = JSON.stringify(raw);
    const state = convertPersistedGameState(raw, "state");

    expect(JSON.stringify(raw)).toBe(before);
    expect(state.status).toBe(entry.status);
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toEqual([]);
    for (const key of ["players", "turn", "eventLog", "winner", "winReason", "activeEffects"] as const) {
      expect(state[key]).toEqual(raw[key]);
    }

    const legacy = createDeterministicExecutionContext(`legacy:${raw.id}`, { gameId: raw.id });
    expect({ ...state.executionContext, idCounter: 0 }).toEqual(legacy);
    expect(state.executionContext.idCounter).toBe(maxEngineIdCounter(state));
  });

  it("fills an absent start-of-game ledger only for a pregame recorded before START_OF_GAME_FX", () => {
    const raw = capture(ABANDONED);
    expect(raw.pregame?.phase).toBe("PRIORITY_CHOICE");
    expect(raw.pregame && "startOfGameEffectsResolved" in raw.pregame).toBe(false);
    const state = convertPersistedGameState(raw, "state");
    expect(state.pregame).toEqual({ ...raw.pregame, startOfGameEffectsResolved: [false, false] });
  });

  it("maps an absent pregame field to null, as the engine stores after pregame", () => {
    const raw = capture(FINISHED);
    expect("pregame" in raw).toBe(false);
    expect(convertPersistedGameState(raw, "state").pregame).toBeNull();
  });

  it.each(manifest.cases)("$file converts deterministically", (entry) => {
    const first = convertPersistedGameState(capture(entry.file), "state");
    const second = convertPersistedGameState(capture(entry.file), "state");
    expect(second).toEqual(first);
  });

  it.each(manifest.cases)("$file loads through the repository without writing storage", async (entry) => {
    const storage = new MemorySessionStorage();
    storage.data.set(SESSION_STORAGE_KEY, { state: capture(entry.file), cardDb: {}, undoHistory: [] });
    const before = JSON.stringify(storage.data.get(SESSION_STORAGE_KEY));
    const repository = new SessionRepository(storage, {
      nextJsUrl: "https://app.example.test",
      workerSecret: "secret",
    });
    const loaded = await repository.load();
    expect(loaded?.state.status).toBe(entry.status);
    expect(loaded?.undoHistory).toEqual([]);
    expect(storage.writes).toEqual([]);
    expect(JSON.stringify(storage.data.get(SESSION_STORAGE_KEY))).toBe(before);
  });
});

describe("OPT-1013 pre-context terminal admission: boundaries", () => {
  const variant = (file: string, patch: Record<string, unknown>): RawState => ({
    ...capture(file),
    ...patch,
  });

  it.each([
    ["an active game", { status: "IN_PROGRESS", winner: null, winReason: null }, "with status \"IN_PROGRESS\""],
    ["a pending prompt", { pendingPrompt: { promptType: "SELECT_TARGET" } }, "with a pending prompt"],
    ["effect-stack work", { effectStack: [{ id: "ef_00000001" }] }, "with effect-stack work"],
  ])("rejects a pre-context save with %s", (_label, patch, reason) => {
    const raw = variant(FINISHED, patch);
    expect(() => convertPersistedGameState(raw, "state")).toThrow(SessionLoadError);
    expect(() => convertPersistedGameState(raw, "state")).toThrow(reason);
    expect(() => convertPersistedGameState(raw, "state")).toThrow(REASON);
  });

  it.each(["START_OF_GAME_FX", "HAND_DEAL", "MULLIGAN_DECISIONS", "LIFE_PLACEMENT", "DONE"])(
    "rejects a missing start-of-game ledger in pregame phase %s",
    (phase) => {
      const raw = capture(ABANDONED);
      const patched = { ...raw, pregame: { ...raw.pregame, phase } };
      expect(() => convertPersistedGameState(patched, "state")).toThrow(
        `pregame phase "${phase}" has no start-of-game effect ledger`
      );
    }
  );

  it("does not apply to an explicit schemaVersion 1 save, which every writer stored with a context", () => {
    const raw = { ...capture(FINISHED), schemaVersion: 1 };
    expect(() => convertPersistedGameState(raw, "state")).toThrow("invalid core shape at executionContext");
  });

  it("applies the same rule to undo snapshots, by location", () => {
    const terminal = capture(FINISHED);
    const active = { ...terminal, status: "IN_PROGRESS", winner: null, winReason: null };
    const session = (undo: unknown[]) => ({ state: terminal, cardDb: {}, undoHistory: undo });

    const admitted = parseStoredSession(session([capture(ABANDONED)]));
    expect(admitted.undoHistory[0]?.status).toBe("ABANDONED");
    expect(() => parseStoredSession(session([active]))).toThrow(
      /^Stored session undoHistory\[0\] is an unversioned save without executionContext/
    );
  });

  it("leaves context-bearing states untouched by the admission", () => {
    const raw = capture(FINISHED);
    const state = convertPersistedGameState(raw, "state");
    const reloaded = convertPersistedGameState(
      JSON.parse(JSON.stringify({ ...state, schemaVersion: undefined })) as GameState,
      "state"
    );
    expect(reloaded.executionContext).toEqual(state.executionContext);
    expect(reloaded.pregame).toEqual(state.pregame);
  });
});
