import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import type { CardData, GameAction, GameState } from "../types.js";
import { SessionRepository, SESSION_STORAGE_KEY } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
interface Capture { producer: string; cases: { stored: Record<string, unknown>; replies: GameAction[] }[]; expected: GameState }
const bytes = readFileSync(new URL("./fixtures/opt-1006-writer-corpus.json.gz", import.meta.url));
const corpus: Record<string, Capture> = JSON.parse(gunzipSync(bytes).toString());
const manifest = JSON.parse(readFileSync(new URL("./fixtures/opt-1006-writer-corpus.manifest.json", import.meta.url), "utf8")) as { sha256: string; families: Record<string, { producer: string; starts: number; native9Starts: number }> };
it("OPT-1006 producer corpus matches its immutable manifest hash, families and producer pins", () => {
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.sha256);
  expect(Object.keys(corpus)).toEqual(Object.keys(manifest.families));
  for (const [name, capture] of Object.entries(corpus)) {
    expect(capture.producer).toBe(manifest.families[name].producer);
    expect(capture.cases).toHaveLength(manifest.families[name].starts);
    expect(capture.cases.filter(start => (start.stored[SESSION_STORAGE_KEY] as { state: GameState }).state.schemaVersion === 9)).toHaveLength(manifest.families[name].native9Starts);
  }
});
const config = { nextJsUrl: "https://x.test", workerSecret: "s" };
for (const [name, capture] of Object.entries(corpus)) for (const [index, start] of capture.cases.entries()) {
  const raw = (start.stored[SESSION_STORAGE_KEY] as { state: GameState }).state;
  if (raw.schemaVersion !== 9) continue; // Pre-transition8 is writer activation evidence, not reader8 semantics.
  it(`OPT-1006 actual producer9 ${name} pause${index}: live/coordinator undo, every reply reload`, async () => {
    expect(capture.producer).toMatch(/^[a-f0-9]{40}$/);
    const storage = new MemorySessionStorage(); for (const [key, value] of Object.entries(start.stored)) storage.data.set(key, structuredClone(value));
    let snapshot = (await new SessionRepository(storage, config).load())!;
    expect(snapshot.state.schemaVersion).toBe(9); expect(snapshot.undoHistory.map(state => state.schemaVersion)).toEqual(((start.stored["session:undo-history"] ?? []) as GameState[]).map(state => state.schemaVersion));
    const coordinator = new SessionCoordinator();
    for (const action of start.replies) {
      const prompt = snapshot.state.pendingPrompt!;
      const routed = coordinator.executeAction(snapshot.state, snapshot.undoHistory, prompt.respondingPlayer, action, snapshot.cardDb as Map<string, CardData>);
      expect(routed.kind, "reason" in routed ? routed.reason : "").toBe("resume");
      const resumed = resumePromptLifecycle(routed.state, action, snapshot.cardDb, { drainPregame: state => state, advanceStartOfTurn: state => state });
      expect(resumed.responseRejected).toBe(false);
      const repo = new SessionRepository(new MemorySessionStorage(), config);
      await repo.save({ ...snapshot, state: resumed.state, undoHistory: routed.undoHistory }); snapshot = (await repo.load())!;
    }
    expect(toPersistedGameState(snapshot.state)).toEqual(capture.expected);
    expect(snapshot.state.schemaVersion).toBe(9); expect(snapshot.state.pendingPrompt).toBeNull(); expect(snapshot.state.effectStack).toEqual([]);
  });
  if (raw.effectStack.some(frame => frame.replacementBatch?.actionKind === "TRASH_CARD")) for (const location of ["state", "undoHistory[0]"]) it(`OPT-1006 TRASH_CARD discriminator rejects schema8 ${name} pause${index} ${location}`, async () => {
    const malformed = structuredClone(raw); malformed.schemaVersion = 8;
    const storage = new MemorySessionStorage(); for (const [key, value] of Object.entries(start.stored)) storage.data.set(key, structuredClone(value));
    if (location === "state") (storage.data.get("session") as { state: GameState }).state = malformed;
    else storage.data.set("session:undo-history", [malformed]);
    const before = structuredClone(storage.data);
    await expect(new SessionRepository(storage, config).load()).rejects.toMatchObject({ name: "SessionLoadError", location, reason: expect.stringMatching(/effectStack\[\d+\]\.replacementBatch.actionKind TRASH_CARD requires schemaVersion 9/) });
    expect(storage.data).toEqual(before); expect(storage.writes).toEqual([]);
  });
}
