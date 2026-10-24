import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";
import type { GameState, EffectStackFrame } from "../types.js";

type Mutate = (frame: EffectStackFrame, state: GameState) => void;
const fixtures = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/opt-997-v7-canonical/${name}.json`, import.meta.url), "utf8")) as CostCorpus;
async function rejectsAtEveryBoundary(values: Record<string, unknown>, bad: GameState) {
  const good = (values.session as { state: GameState }).state;
  const parsed = parseStoredSession(values.session, values["session:card-db"], []);
  for (const index of [-1, 0, 3]) {
    const undo = Array.from({ length: 4 }, () => structuredClone(good));
    if (index >= 0) undo[index] = bad;
    const snapshot = { state: index < 0 ? bad : good, cardDb: new Map(Object.entries(parsed.cardDb)), mode: "PVP" as const, pregameMode: "PRIORITY_ROLL" as const, testPriorityRolls: null, undoHistory: undo };
    const beforeInput = structuredClone(snapshot); const { repo, values: storage } = memoryRepository({ sentinel: "preserve" });
    const beforeMetrics = repo.getLastMetrics(); const beforeSummary = repo.getHistorySummary();
    await expect(repo.save(snapshot)).rejects.toThrow();
    expect(snapshot).toEqual(beforeInput); expect(storage).toEqual({ sentinel: "preserve" });
    expect(repo.getLastMetrics()).toEqual(beforeMetrics); expect(repo.getHistorySummary()).toEqual(beforeSummary);
    for (const embedded of [false, true]) {
      const raw = structuredClone(values); const session = raw.session as { state: GameState; undoHistory?: GameState[] };
      session.state = snapshot.state; delete session.undoHistory;
      if (embedded) session.undoHistory = undo; else raw["session:undo-history"] = undo;
      const stored = memoryRepository(raw); const beforeStorage = structuredClone(stored.values);
      await expect(stored.repo.load()).rejects.toThrow(); expect(stored.values).toEqual(beforeStorage);
      expect(stored.repo.getLastMetrics()).toBeNull();
    }
  }
}
const cases: [string, string, Mutate][] = [
  ["explicit owner kind", "fixed-accept-prefix", f => { f.kind = "EFFECT"; }],
  ["phase", "fixed-accept-prefix", f => { f.phase = "AWAITING_TARGET_SELECTION"; }],
  ["unchecked", "fixed-accept-prefix", f => { f.costReplacementChecked = false; }],
  ["missing replay", "fixed-accept-prefix", f => { delete f.costReplacementAction; }],
  ["missing current cost", "fixed-accept-prefix", f => { f.costs = []; }],
  ["invalid cost index", "fixed-accept-prefix", f => { f.currentCostIndex = 99; }],
  ["malformed action", "fixed-accept-prefix", f => { f.costReplacementAction = { type: "SELECT_TARGET" } as never; }],
  ["fixed domain", "fixed-accept-prefix", f => { f.validTargets = [f.sourceCardInstanceId]; }],
  ["native repair forbidden", "canonical-arrange-bottom-decline", f => { if (f.costReplacementAction?.type === "ARRANGE_TOP_CARDS") f.costReplacementAction.destination = "top"; }],
  ["wrong selection count", "selected-accept-prefix", f => { f.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: [] }; }],
  ["foreign selection", "selected-accept-prefix", f => { f.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: ["foreign"] }; }],
  ["contradictory continuation family", "fixed-accept-prefix", (f, state) => { f.replacement = state.effectStack.at(-1)!.replacement; }],
  ["duplicate frame ID", "fixed-accept-prefix", (f, state) => { state.effectStack.at(-1)!.id = f.id; }],
  ["dangling prompt", "fixed-accept-prefix", (_f, state) => { state.pendingPrompt!.resumeContext = "foreign"; }],
];
for (const [name, family, mutate] of cases) it(`native7 ${name} rejects without normalization or partial writes at every boundary`, async () => {
  const f = fixtures(family); const values = [f.initial, ...f.steps.map(s => s.stored)].find(v => (v.session as { state: GameState }).state.effectStack.some(f => f.costReplacementAction))!;
  const state = structuredClone((values.session as { state: GameState }).state);
  mutate(state.effectStack.find(f => f.costReplacementAction)!, state);
  await rejectsAtEveryBoundary(values, state);
});
for (const defect of ["missing", "invalid", "modern-markers"] as const) it(`native7 End Phase ${defect} rejects before legacy stage fallback`, async () => {
  const golden = loadGoldenFixture().cases["end-phase-parked"];
  const original = JSON.parse(golden.sessionJson);
  const valid = toPersistedGameState({ ...convertPersistedGameState(original.state, "state"), schemaVersion: 7 });
  const bad = structuredClone(valid); const boundary = bad.effectStack.find(f => f.phaseBoundaryContinuation)!.phaseBoundaryContinuation!;
  if (defect === "missing") { delete boundary.stage; boundary.remainingScheduledActions = []; }
  if (defect === "invalid") boundary.stage = "INVALID" as never;
  if (defect === "modern-markers") Object.assign(boundary, { activatedWaveEffects: [] });
  await rejectsAtEveryBoundary({ session: { ...original, state: valid }, "session:card-db": JSON.parse(golden.cardDbJson) }, bad);
});
it("legacy runtime genuinely stage-less End Phase uses existing fallback without input mutation", async () => {
  const golden = loadGoldenFixture().cases["end-phase-parked"];
  const original = JSON.parse(golden.sessionJson); const state = convertPersistedGameState(original.state, "state");
  delete state.effectStack.find(f => f.phaseBoundaryContinuation)!.phaseBoundaryContinuation!.stage; state.schemaVersion = 6;
  const before = structuredClone(state); const { repo } = memoryRepository();
  const saved = await repo.save({ state, cardDb: new Map(Object.entries(JSON.parse(golden.cardDbJson))), mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
  expect(state).toEqual(before); expect(saved.state.schemaVersion).toBe(7);
  expect(saved.state.effectStack.find(f => f.phaseBoundaryContinuation)!.phaseBoundaryContinuation!.stage).toBe("LEGACY_SCHEDULED_ACTIONS");
  expect((await repo.load())!.state).toEqual(saved.state);
});
it("legacy runtime cannot smuggle native7 COST outcome metadata through save", async () => {
  const f = fixtures("fixed-accept-prefix"); const values = [f.initial, ...f.steps.map(s => s.stored)].find(v => (v.session as { state: GameState }).state.effectStack.some(f => f.costReplacementAction))!;
  const bad = structuredClone((values.session as { state: GameState }).state); bad.schemaVersion = 6;
  bad.effectStack.find(f => f.costReplacementAction)!.costReplacementResolution = "REPLACED";
  await rejectsAtEveryBoundary(values, bad);
});
