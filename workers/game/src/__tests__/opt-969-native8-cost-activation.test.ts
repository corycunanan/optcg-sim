/** Source classification precedes cost proof and envelope activation. */
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setupGame } from "./helpers.js";
import { memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { promoteGameStateForWriter, parseStoredSession, convertPersistedGameState } from "../session/persistence.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";
import type { GameState } from "../types.js";
function legacy() {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/opt-997-v7-canonical/promotion-bottom-decline.json", import.meta.url), "utf8")) as CostCorpus & { promotionSource: Record<string, unknown> };
  const values = structuredClone(fixture.promotionSource);
  const parsed = parseStoredSession(values.session, values["session:card-db"], []);
  return { values, state: parsed.state, db: new Map(Object.entries(parsed.cardDb)) };
}
for (const boundary of ["load", "save", "Coordinator"] as const) it(`source6 proves historical unanswered replay before8/mode7 at ${boundary}`, async () => {
  const { values, state, db } = legacy();
  expect(state.schemaVersion).toBe(6);
  const before = structuredClone(state);
  let next: GameState;
  if (boundary === "load") next = (await memoryRepository(values).repo.load())!.state;
  else if (boundary === "save") next = (await memoryRepository().repo.save({ state, cardDb: db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] })).state;
  else {
    const result = new SessionCoordinator().executeAction(state, [state], state.pendingPrompt!.respondingPlayer, { type: "PLAYER_CHOICE", choiceId: "skip", promptId: state.pendingPrompt!.promptId }, db);
    expect(result.kind).toBe("resume"); next = result.state;
  }
  expect(next).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 7 });
  const owner = next.effectStack.find(frame => frame.costReplacementAction)!;
  expect(owner.costReplacementAction!.type === "ARRANGE_TOP_CARDS" && owner.costReplacementAction.destination).toBe("bottom");
  expect(owner.costReplacementResolution).toBeUndefined(); expect(owner.costExpectedRoot).toBeUndefined();
  expect(state).toEqual(before);
});
it("already8/mode6 keeps its original replay and diagnostic evidence absence", () => {
  const { state } = legacy();
  const original = { ...state, schemaVersion: 8 as const, costSemanticsVersion: 6 as const };
  const before = structuredClone(original);
  const next = promoteGameStateForWriter(original, "state");
  expect(next).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 6 });
  expect(next.effectStack.find(frame => frame.costReplacementAction)?.costReplacementAction).toEqual(original.effectStack.find(frame => frame.costReplacementAction)?.costReplacementAction);
  expect(original).toEqual(before);
});
for (const boundary of ["load", "save", "Coordinator"] as const) it(`unprovable source6 fails atomically at ${boundary}`, async () => {
  const { values, state, db } = legacy();
  state.effectStack.find(frame => frame.costReplacementAction)!.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: ["foreign"] };
  const before = structuredClone(state);
  if (boundary === "Coordinator") {
    const history = [state];
    const result = new SessionCoordinator().executeAction(state, history, 0, { type: "PASS" }, db);
    expect(result.kind).toBe("reject"); expect(result.state).toBe(state); expect(result.undoHistory[0]).toBe(state);
  } else {
    const m = memoryRepository(boundary === "load" ? { ...values, session: { ...(values.session as object), state } } : { sentinel: true });
    const storage = structuredClone(m.values);
    if (boundary === "load") await expect(m.repo.load()).rejects.toThrow();
    else await expect(m.repo.save({ state, cardDb: db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] })).rejects.toThrow();
    expect(m.values).toEqual(storage); expect(m.repo.getLastMetrics()).toBeNull();
  }
  expect(state).toEqual(before);
});
it("mixed6/7/8 modes and discarded invalid undo validate before prompt allocation, metrics and typed action", async () => {
  const { state, cardDb } = setupGame();
  expect(state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 });
  const six = { ...state, schemaVersion: 6 as const }; delete six.costSemanticsVersion;
  const seven = { ...six, schemaVersion: 7 as const };
  const oldEight = { ...state, costSemanticsVersion: 6 as const };
  expect([six, seven, oldEight, state].map((source, i) => promoteGameStateForWriter(source, `undoHistory[${i}]`).costSemanticsVersion)).toEqual([7, 7, 6, 8]);
  const bad = { ...state }; delete bad.costSemanticsVersion;
  const undo = [six, seven, oldEight, bad]; const before = structuredClone({ state, undo });
  const m = memoryRepository({ sentinel: true });
  await expect(m.repo.save({ state, cardDb, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: undo })).rejects.toThrow();
  expect(m.values).toEqual({ sentinel: true }); expect(m.repo.getLastMetrics()).toBeNull();
  const result = new SessionCoordinator().executeAction(state, undo, 0, { type: "ATTACH_DON", targetInstanceId: state.players[0].leader.instanceId, count: 1 }, cardDb);
  expect(result.kind).toBe("reject"); expect(result.state).toBe(state);
  expect({ state, undo }).toEqual(before);
  for (const embedded of [false, true]) {
    const values = { session: { state: toPersistedGameState(state), cardDb: Object.fromEntries(cardDb), ...(embedded ? { undoHistory: undo } : {}) }, ...(!embedded ? { "session:undo-history": undo } : {}) };
    const input = structuredClone(values);
    await expect(memoryRepository(values).repo.load()).rejects.toThrow(); expect(values).toEqual(input);
  }
});
it("explicit8 typed fast path validates missing native stage, malformed replay, and invalid actions retain original references", () => {
  const { state, cardDb } = setupGame();
  const malformed = { ...state, costSemanticsVersion: undefined };
  const undo = [state];
  const result = new SessionCoordinator().executeAction(malformed, undo, 0, { type: "CONCEDE" }, cardDb);
  expect(result.kind).toBe("reject"); expect(result.state).toBe(malformed); expect(result.undoHistory[0]).toBe(state);
  const invalid = new SessionCoordinator().executeAction(state, undo, 1, { type: "ADVANCE_PHASE" }, cardDb);
  expect(invalid.kind).toBe("reject"); expect(invalid.state).toBe(state); expect(invalid.undoHistory[0]).toBe(state);
});

it("explicit8 Coordinator rejects pre-encoding native replay/stage defects before its action fast path", () => {
  const { state, db } = legacy();
  const native = promoteGameStateForWriter(state, "state");
  const malformedReplay = structuredClone(native);
  malformedReplay.effectStack.find(frame => frame.costReplacementAction)!.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: ["foreign"] };
  const raw = JSON.parse(loadGoldenFixture().cases["end-phase-parked"].sessionJson).state;
  const missingStage = promoteGameStateForWriter(convertPersistedGameState(raw, "state"), "state");
  delete missingStage.effectStack.find(frame => frame.phaseBoundaryContinuation)!.phaseBoundaryContinuation!.stage;
  for (const bad of [malformedReplay, missingStage]) {
    const before = structuredClone(bad); const undo = [native];
    const rejected = new SessionCoordinator().executeAction(bad, undo, 0, { type: "CONCEDE" }, db);
    expect(rejected.kind).toBe("reject"); expect(rejected.state).toBe(bad); expect(rejected.undoHistory[0]).toBe(native);
    expect(bad).toEqual(before);
  }
});

for (const mode of [6, 7] as const) it(`validated explicit8 mode${mode} retains original runtime references`, () => {
  const source = legacy();
  const state = promoteGameStateForWriter(source.state, "state"); state.costSemanticsVersion = mode;
  for (const frame of state.effectStack) delete frame.kind;
  expect(state.effectStack.length).toBeGreaterThan(0);
  const before = structuredClone(state);
  expect(promoteGameStateForWriter(state, "state")).toBe(state);
  expect(state).toEqual(before);
});
it("source7 routing activates8 before separately rejected lifecycle while direct reject preserves7", async () => {
  const { generateCounter } = await import("./history-counter-producer.js");
  const { runtime, memory } = await import("./native7-producer-support.js");
  const rt = await runtime();
  const loaded = (await memory(rt, await generateCounter()).repo.load())!;
  const historical = { ...loaded.state, schemaVersion: 7 as const }; delete historical.costSemanticsVersion;
  historical.turn = { ...historical.turn, actionsPerformedThisTurn: [...historical.turn.actionsPerformedThisTurn, { actionType: "PASS", timestamp: 999 }] };
  const before = structuredClone(historical);
  const action = { type: "PLAYER_CHOICE" as const, choiceId: `don-return-ids:${JSON.stringify([historical.players[1].donCostArea.find(don => don.state === "ACTIVE")!.instanceId])}`, promptId: historical.pendingPrompt!.promptId };
  const denied = new SessionCoordinator().executeAction(historical, [], 0, action, loaded.cardDb);
  expect(denied.kind).toBe("reject"); expect(denied.state).toBe(historical);
  const routed = new SessionCoordinator().executeAction(historical, [], 1, action, loaded.cardDb);
  expect(routed.kind).toBe("resume"); expect(routed.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 7 });
  const activeBefore = structuredClone(routed.state);
  const declined = rt.resumePromptLifecycle(routed.state, action, loaded.cardDb, { drainPregame: state => state, advanceStartOfTurn: state => state });
  expect(declined.responseRejected).toBe(true); expect(declined.state).toBe(routed.state); expect(declined.state).toEqual(activeBefore);
  expect(historical).toEqual(before);
});
