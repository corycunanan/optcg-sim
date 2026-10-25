import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import type { CardData, GameAction, GameState } from "../types.js";
import { SessionRepository, SESSION_STORAGE_KEY } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { runtime, memory } from "./native7-producer-support.js";
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
  it(`OPT-1006 frozen producer${raw.schemaVersion} ${name} pause${index}: live/coordinator undo, every reply reload`, async () => {
    expect(capture.producer).toMatch(/^[a-f0-9]{40}$/);
    const storage = new MemorySessionStorage(); for (const [key, value] of Object.entries(start.stored)) storage.data.set(key, structuredClone(value));
    let snapshot = (await new SessionRepository(storage, config).load())!;
    expect(snapshot.state.schemaVersion).toBe(raw.schemaVersion); expect(snapshot.undoHistory.map(state => state.schemaVersion)).toEqual(((start.stored["session:undo-history"] ?? []) as GameState[]).map(state => state.schemaVersion));
    const floor = await runtime(process.env.OPT1006_WRITER_FLOOR_ROOT);
    let rollback = raw.schemaVersion === 9 ? (await memory(floor, start.stored).repo.load())! : undefined;
    const coordinator = new SessionCoordinator();
    for (const recordedAction of start.replies) {
      const prompt = snapshot.state.pendingPrompt!;
      // The six pre8 cases were saved independently, before first-prompt IDs
      // were recorded. They are user-choice scripts, not contiguous ID suffixes.
      // Submit authoritative live IDs for that path; native9 suffixes stay exact.
      const action = raw.schemaVersion === 8 || !("promptId" in recordedAction) || recordedAction.promptId === undefined ? { ...recordedAction, promptId: prompt.promptId } as GameAction : recordedAction;
      const routed = coordinator.executeAction(snapshot.state, snapshot.undoHistory, prompt.respondingPlayer, action, snapshot.cardDb as Map<string, CardData>);
      expect(routed.kind, JSON.stringify({ reason: "reason" in routed ? routed.reason : "", action, prompt })).toBe("resume");
      const resumed = resumePromptLifecycle(routed.state, action, snapshot.cardDb, { drainPregame: state => state, advanceStartOfTurn: state => state });
      expect(resumed.responseRejected).toBe(false);
      const emitted = new MemorySessionStorage();
      const repo = new SessionRepository(emitted, config);
      await repo.save({ ...snapshot, state: resumed.state, undoHistory: routed.undoHistory }); snapshot = (await repo.load())!;
      if (rollback) {
        const routedFloor = new floor.SessionCoordinator().executeAction(rollback.state, rollback.undoHistory, prompt.respondingPlayer, action, rollback.cardDb);
        expect(routedFloor.kind).toBe("resume");
        const completed = floor.resumePromptLifecycle(routedFloor.state, action, rollback.cardDb, { drainPregame: state => state, advanceStartOfTurn: state => state });
        expect(completed.responseRejected).toBe(false);
        const savedFloor = memory(floor);
        await savedFloor.repo.save({ ...rollback, state: completed.state, undoHistory: routedFloor.undoHistory });
        expect(savedFloor.values).toEqual(Object.fromEntries(emitted.data));
        rollback = (await savedFloor.repo.load())!;
      } else {
        // This is actual final-writer output, loaded unchanged by the floor.
        rollback = (await memory(floor, Object.fromEntries(emitted.data)).repo.load())!;
        expect(rollback).toEqual(snapshot);
      }
    }
    const actual = toPersistedGameState(snapshot.state);
    if (raw.schemaVersion === 8) {
      // These starts are non-contiguous historical choice scripts. Keep their
      // independently saved bytes immutable; assert gameplay independently,
      // while the actual final writer and floor compare every emitted byte.
      const accept = name.includes("-accept-");
      const owner = snapshot.state.players[0];
      expect(owner.characters.some(card => card?.cardId === "OPT1001-NAVY-0")).toBe(accept);
      expect(owner.trash).toHaveLength(accept ? 0 : 4);
      if (accept) expect(owner.deck.slice(-3).map(card => card.cardId)).toEqual(["OPT1001-PAY-2", "OPT1001-PAY-1", "OPT1001-PAY-0"]);
      expect(snapshot.state.costSemanticsVersion).toBe(raw.costSemanticsVersion);
      expect(snapshot.state.eventLog.filter(event => event.type === "CARD_KO")).toEqual([]);
    } else expect(actual).toEqual(capture.expected);
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
