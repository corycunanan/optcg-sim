import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SessionRepository, convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import type { GameState } from "../types.js";
function sample() {
  const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/opt-969/action-identity.json", import.meta.url)), "utf8"));
  const stored = structuredClone(fixture.initial) as Record<string, unknown>;
  const state = (stored.session as { state: GameState }).state;
  state.schemaVersion = 7;
  const options = state.pendingPrompt!.options;
  if (options.promptType !== "PLAYER_CHOICE") throw new Error("fixture is not an identity choice");
  options.donIdentityReturn = { countMin: 1, countMax: 1, groups: options.choices.map(c => ({ donIds: JSON.parse(c.id.slice("don-return-ids:".length)), label: c.label })) };
  stored["session:undo-history"] = [structuredClone(state)];
  return { stored, state, options };
}
it("preserves native7 in live and every mixed undo entry while ordinary v6 writing stays6", async () => {
  const { stored, state } = sample();
  const old = structuredClone(state); old.schemaVersion = 6;
  if (old.pendingPrompt!.options.promptType === "PLAYER_CHOICE") delete old.pendingPrompt!.options.donIdentityReturn;
  stored["session:undo-history"] = [old, state, structuredClone(old)];
  const parsed = parseStoredSession(stored.session, stored["session:card-db"], stored["session:undo-history"]);
  expect(parsed.undoHistory.map(s => s.schemaVersion)).toEqual([6, 7, 6]);
  const storage = new MemorySessionStorage(); await storage.put(stored);
  const repo = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" });
  const loaded = (await repo.load())!;
  expect(loaded.state.schemaVersion).toBe(7);
  // Repository intentionally bounds retained undo to the latest entry after all entries validate.
  expect(loaded.undoHistory.map(s => s.schemaVersion)).toEqual([6]);
  await repo.save(loaded);
  const again = (await repo.load())!;
  expect(again.state).toEqual(loaded.state);
  expect(again.undoHistory).toEqual(loaded.undoHistory);
  expect(toPersistedGameState(old).schemaVersion).toBe(6);
});
it("rejects downgraded picker metadata at live and all undo ingresses without rewriting storage", async () => {
  for (const schemaVersion of [undefined, 1, 2, 3, 4, 5, 6]) for (const ingress of ["live", "undo0", "undo1"]) {
    const { stored, state } = sample();
    const bad = structuredClone(state) as unknown as Record<string, unknown>;
    if (schemaVersion === undefined) delete bad.schemaVersion; else bad.schemaVersion = schemaVersion;
    if (ingress === "live") (stored.session as { state: unknown }).state = bad;
    else stored["session:undo-history"] = ingress === "undo0" ? [bad, state] : [state, bad];
    const storage = new MemorySessionStorage(); await storage.put(stored);
    const before = JSON.stringify([...storage.data]);
    await expect(new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" }).load()).rejects.toThrow("requiring schemaVersion 7");
    expect(JSON.stringify([...storage.data])).toBe(before);
  }
});
it("strictly validates identity picker groups, bounds and offered IDs", () => {
  for (const defect of ["duplicate", "overlap", "bounds", "foreign", "legacy", "empty"]) {
    const { state, options } = sample();
    const picker = options.donIdentityReturn!;
    if (defect === "duplicate") picker.groups[0].donIds.push(picker.groups[0].donIds[0]);
    if (defect === "overlap") picker.groups[1].donIds.push(picker.groups[0].donIds[0]);
    if (defect === "bounds") picker.countMin = 2;
    if (defect === "foreign") options.choices[0].id = 'don-return-ids:["foreign"]';
    if (defect === "legacy") options.donReturn = { count: 1, sources: [] };
    if (defect === "empty") picker.groups[0].donIds = [];
    expect(() => convertPersistedGameState(state, "state")).toThrow();
  }
});
