import { orderedEnvelope } from "./opt-981-test-ordering.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GameSession } from "../GameSession.js";
import type { CardData, Env, GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

const directory = resolve(__dirname, "fixtures/opt-1004-scheduled-resume-writer10");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
const archive = JSON.parse(readFileSync(resolve(directory, "archive-manifest.json"), "utf8"));
type Stored = Record<string, unknown> & { session: { state: GameState } };
type Scenario = { initial: Stored; steps: { action: GameAction; player: 0 | 1; stored: Stored }[]; expectedDonEvents: number; allowNo10?: boolean };
const corpus = JSON.parse(gunzipSync(readFileSync(resolve(directory, "cases.json.gz"))).toString()) as { provenance: string; cases: Record<string, Scenario> };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const options = { nextJsUrl: "https://app.example.test", workerSecret: "test" };
const memory = (values: Stored) => {
  const storage = new MemorySessionStorage();
  for (const [key, value] of Object.entries(values)) storage.data.set(key, structuredClone(value));
  return storage;
};
type Access = { gameState: GameState; cardDb: Map<string, CardData>; undoHistory: GameState[]; writeResultToDb(): Promise<void>; handleAction(ws: WebSocket, player: 0 | 1, action: GameAction): Promise<void> };

it("pins actual isolated writer candidate, payload, patch and capture sources", () => {
  expect(manifest.producerCommit).toBe("046324c4bf2aa2072c3ba253b9a04c9c9ab0893c");
  expect(manifest.readerBase).toBe("ab15a965dcda19cf609a6c169abe7b867037c59f");
  expect(manifest.caseCount).toBe(Object.keys(corpus.cases).length);
  expect(manifest.snapshots).toBe(Object.values(corpus.cases).reduce((n, c) => n + 1 + c.steps.length, 0));
  expect(corpus.provenance).toContain("synthetic");
  for (const [file, sha] of Object.entries(manifest.fixtures)) expect(hash(readFileSync(resolve(directory, file))), file).toBe(sha);
  for (const [file, sha] of Object.entries(archive.files)) expect(hash(readFileSync(resolve(directory, file))), file).toBe(sha);
  expect(hash(readFileSync(resolve(directory, "sources/opt-1004-writer-producer.test-source")))).toBe(manifest.sourceHashes["workers/game/src/__tests__/opt-1004-writer-producer.test.ts"]);
});

it("reads every actual writer boundary live/undo write-free and retains10 when re-saving", async () => {
  let count = 0;
  let mixed = false;
  for (const scenario of Object.values(corpus.cases)) {
    for (const values of [scenario.initial, ...scenario.steps.map(s => s.stored)]) {
      const storage = memory(values);
      const before = structuredClone([...storage.data]);
      const repository = new SessionRepository(storage, options);
      const loaded = (await repository.load())!;
      expect([...storage.data]).toEqual(before);
      expect(storage.writes).toEqual([]);
      expect(loaded.state.costSemanticsVersion).toBe(values.session.state.costSemanticsVersion);
      expect(loaded.state.fieldTrashSemanticsVersion).toBe(values.session.state.fieldTrashSemanticsVersion);
      const originalUndo = values["session:undo-history"] as GameState[];
      if (loaded.state.schemaVersion === 10 && originalUndo.some(s => s.schemaVersion === 8)) mixed = true;
      expect(loaded.undoHistory.map(s => s.schemaVersion)).toEqual(originalUndo.map(s => s.schemaVersion));
      await repository.save({ ...loaded, state: loaded.state, cardDb: loaded.cardDb, undoHistory: loaded.undoHistory });
      const emitted = storage.data.get("session") as { state: GameState };
      expect(emitted.state.schemaVersion).toBe(values.session.state.schemaVersion);
      expect(emitted.state.costSemanticsVersion).toBe(values.session.state.costSemanticsVersion);
      expect(emitted.state.scheduledActions).toEqual(values.session.state.scheduledActions);
      count++;
    }
  }
  expect(count).toBe(manifest.snapshots);
  expect(mixed).toBe(true);
});

describe.each(Object.entries(corpus.cases))("OPT-1004 actual writer suffix %s", (id, scenario) => {
  it("loads and semantically resumes from every newly written10 boundary, with pure8 skip equality", async () => {
    // Stage 1 deliberately does not activate schema10 from8. Resume only
    // after initial writer activation of10; later10 scheduling must match too.
    const boundaries = [scenario.initial, ...scenario.steps.map(step => step.stored)];
    const start = boundaries.findIndex(stored => stored.session.state.schemaVersion === 10);
    const starts = boundaries.flatMap((values, index) => values.session.state.schemaVersion === 10 ? [index] : []);
    if (scenario.allowNo10) { expect(starts).toEqual([]); starts.push(0); }
    else expect(start).toBeGreaterThanOrEqual(0);
    for (const boundary of starts) {
    const storage = memory(boundaries[boundary]);
    const durable = { storage, getWebSockets: () => [], getTags: () => [], acceptWebSocket() {} } as unknown as DurableObjectState;
    let loaded = (await new SessionRepository(storage, options).load())!;
    let orderingDecisions = 0;
    for (const step of scenario.steps.slice(boundary)) {
      const session = new GameSession(durable, { GAME_WORKER_SECRET: "test", NEXTJS_URL: options.nextJsUrl } as Env) as unknown as Access;
      session.gameState = loaded.state; session.cardDb = loaded.cardDb; session.undoHistory = loaded.undoHistory;
      session.writeResultToDb = async () => undefined;
      const sent: string[] = [];
      await session.handleAction({ send(value: string) { sent.push(value); }, close() {} } as unknown as WebSocket, step.player, loaded.state.pendingPrompt ? { ...step.action, promptId: loaded.state.pendingPrompt.promptId } as GameAction : step.action);
      expect(sent.map(s => JSON.parse(s)).filter(m => m.type === "action:rejected"), id).toEqual([]);
      // OPT-981 inserts explicit owner decisions. Choose the former FIFO order
      // through GameSession itself, preserving this archived suffix's gameplay.
      while (session.gameState.effectStack.at(-1)?.phaseBoundaryContinuation?.awaitingOrder) {
        const prompt = session.gameState.pendingPrompt!;
        await session.handleAction({ send(value: string) { sent.push(value); }, close() {} } as unknown as WebSocket,
          prompt.respondingPlayer, { type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0", promptId: prompt.promptId });
        orderingDecisions++;
      }
      const actual = Object.fromEntries(storage.data) as Stored;
      const expected = structuredClone(step.stored);
      expected.session.state = orderedEnvelope(expected.session.state, actual.session.state);
      if (orderingDecisions) {
        expected.session.state.executionContext!.idCounter += orderingDecisions;
        // A newly offered player choice invalidates phase-advance undo under
        // the existing session policy, even when the old FIFO trace had no pause.
        expect(actual["session:undo-history"]).toEqual([]);
        expected["session:undo-history"] = [];
        const oldActions = expected.session.state.turn.actionsPerformedThisTurn;
        const newActions = actual.session.state.turn.actionsPerformedThisTurn;
        if (oldActions.length === newActions.length + 1) {
          // The old continuous ADVANCE_PHASE was logged after handoff. The new
          // prompt continuation finishes the old turn without attributing that
          // action to the next player, consuming one fewer logical timestamp.
          const removed = oldActions.shift()!;
          expect(removed.actionType).toBe("ADVANCE_PHASE");
          for (const event of expected.session.state.eventLog) if (event.timestamp >= removed.timestamp) event.timestamp--;
          for (const action of oldActions) if (action.timestamp >= removed.timestamp) action.timestamp--;
          expected.session.state.executionContext!.clockCounter--;
        }
      }
      // Each new saved ordering prompt allocates an ID. Compare generated IDs by
      // occurrence; the exact counter delta above still guards extra allocation.
      const normalizeIds = (value: unknown) => {
        const ids = new Map<string, string>();
        return JSON.stringify(value).replace(/(?:card|ef|prompt)_[0-9a-z]+/g, key => {
          if (!ids.has(key)) ids.set(key, `engine-${ids.size}`); return ids.get(key)!;
        });
      };
      expect(JSON.parse(normalizeIds(actual)), `${id} ${step.action.type}`).toEqual(JSON.parse(normalizeIds(expected)));
      loaded = (await new SessionRepository(storage, options).load())!;
    }
    expect(loaded.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(scenario.expectedDonEvents);
    expect(loaded.state.pendingPrompt).toBeNull();
    expect(loaded.state.turn.activePlayerIndex).toBe(scenario.steps.at(-1)!.stored.session.state.turn.activePlayerIndex);
    }
  });
});
