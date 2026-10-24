import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setupGame } from "./helpers.js";
import { rig, synSchema } from "./opt-960-rig.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { memoryRepository, command, type CostCorpus } from "./opt-997-corpus-support.js";
import { classifyLegacyShapes } from "../session/game-state-schema.js";
import type { GameState } from "../types.js";

it("new games own schema8/mode7 before their first save and load", async () => {
  const { state, cardDb } = setupGame(); expect(state.schemaVersion).toBe(8);
  const { repo, values } = memoryRepository();
  const saved = await repo.save({ state, cardDb, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
  expect(saved.state.schemaVersion).toBe(8);
  expect((values.session as { state: GameState }).state.schemaVersion).toBe(8);
  expect((await repo.load())!.undoHistory[0].schemaVersion).toBe(8);
});
function corpus(name: string) { return JSON.parse(readFileSync(new URL(`./fixtures/opt-997-v7-canonical/${name}.json`, import.meta.url), "utf8")) as CostCorpus & { promotionSource?: Record<string, unknown> }; }
it("atomically promotes an unanswered6 offer and every mixed undo snapshot before its first reply", async () => {
  const fixture = corpus("promotion-bottom-decline"); const original = fixture.promotionSource!;
  const { repo, values } = memoryRepository(original); const before = structuredClone(values);
  const loaded = (await repo.load())!;
  for (const state of [loaded.state, ...loaded.undoHistory]) {
    expect(state.schemaVersion).toBe(8);
    const owner = state.effectStack.find(f => f.costReplacementAction)!;
    expect(owner.costReplacementResolution).toBeUndefined();
    expect(owner.costReplacementAction!.type === "ARRANGE_TOP_CARDS" && owner.costReplacementAction.destination).toBe("bottom");
  }
  expect(values).toEqual(before);
  const state = command(loaded.state, { type: "PLAYER_CHOICE", choiceId: "skip" }, loaded.cardDb);
  expect(state.pendingPrompt).toBeNull(); expect(state.effectStack).toHaveLength(0);
  expect(state.players[0].hand).toHaveLength(4);
});
it("retains valid orphan legacy debt as a native-cost7 diagnostic through load/action/save", async () => {
  const fixture: CostCorpus = JSON.parse(readFileSync(new URL("./fixtures/opt-997-v7/legacy-accepted6-unknown.json", import.meta.url), "utf8"));
  const values = fixture.steps.at(-1)?.stored ?? fixture.initial;
  const { repo } = memoryRepository(values); const loaded = (await repo.load())!;
  expect(loaded.state.schemaVersion).toBe(8);
  const owner = loaded.state.effectStack.find(f => f.costReplacementAction)!;
  expect(owner.costReplacementResolution).toBeUndefined();
  expect(classifyLegacyShapes(loaded.state).some(shape => shape.shape === "legacy.cost_replacement_outcome_unknown")).toBe(true);
  const { SessionCoordinator } = await import("../session/coordinator.js");
  const result = new SessionCoordinator().executeAction(loaded.state, loaded.undoHistory, 0, { type: "ATTACH_DON", targetInstanceId: loaded.state.players[0].leader.instanceId, count: 1 }, loaded.cardDb);
  const control = new SessionCoordinator().executeAction({ ...loaded.state, schemaVersion: 8, costSemanticsVersion: 6 }, loaded.undoHistory, 0, { type: "ATTACH_DON", targetInstanceId: loaded.state.players[0].leader.instanceId, count: 1 }, loaded.cardDb);
  expect(result.kind).toBe(control.kind);
  expect(result.state.players).toEqual(control.state.players);
  expect(result.state.effectStack.find(f => f.costReplacementAction)!.costReplacementResolution).toBeUndefined();
  expect(classifyLegacyShapes(result.state).some(shape => shape.shape === "legacy.cost_replacement_outcome_unknown")).toBe(true);
  await repo.save({ ...loaded, state: result.state }); const again = (await repo.load())!;
  expect(again.state.effectStack.find(f => f.costReplacementAction)!.costReplacementResolution).toBeUndefined();
});
for (const embedded of [false, true]) for (const index of [0, 3]) it(`unprovable late legacy undo fails atomically embedded=${embedded} index=${index}`, async () => {
  const original = structuredClone(corpus("promotion-bottom-decline").promotionSource!);
  const session = original.session as { state: GameState; undoHistory?: GameState[] };
  const undo = Array.from({ length: 4 }, () => structuredClone(session.state));
  undo[index].effectStack.find(f => f.costReplacementAction)!.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: ["foreign"] };
  if (embedded) session.undoHistory = undo; else original["session:undo-history"] = undo;
  const { repo, values } = memoryRepository(original); const before = structuredClone(values);
  await expect(repo.load()).rejects.toThrow(/legacy-debt.*unprovable/); expect(values).toEqual(before);
});

for (const version of [undefined, 1, 2, 3, 4, 5, 6, 7] as const) it(`promotes supported source ${version ?? "absent"} and mixed history atomically`, async () => {
  const { state, cardDb } = setupGame(); const raw = structuredClone(state) as unknown as Record<string, unknown>;
  delete raw.costSemanticsVersion;
  if (version === undefined) delete raw.schemaVersion; else raw.schemaVersion = version;
  const native = structuredClone(state);
  const original = { session: { state: raw, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null }, "session:card-db": Object.fromEntries(cardDb), "session:undo-history": [raw, native, raw] };
  const { repo, values } = memoryRepository(original); const before = structuredClone(values);
  const loaded = (await repo.load())!;
  expect(loaded.state.schemaVersion).toBe(8); expect(loaded.undoHistory.map(s => s.schemaVersion)).toEqual([8]);
  expect(values).toEqual(before);
});
it("save validates unprovable undo before any compaction or storage write", async () => {
  const original = corpus("promotion-bottom-decline").promotionSource!;
  const state = (original.session as { state: GameState }).state;
  const { parseStoredSession } = await import("../session/persistence.js");
  const parsed = parseStoredSession(original.session, original["session:card-db"], []);
  const bad = structuredClone(state); delete bad.effectStack.find(f => f.costReplacementAction)!.costReplacementAction;
  const snapshot = { state, cardDb: new Map(Object.entries(parsed.cardDb)), mode: "PVP" as const, pregameMode: "PRIORITY_ROLL" as const, testPriorityRolls: null, undoHistory: [bad, state, state, state] };
  const before = structuredClone(snapshot); const { repo, values } = memoryRepository({ sentinel: "preserve" });
  await expect(repo.save(snapshot)).rejects.toThrow(/legacy-debt.*unprovable/);
  expect(snapshot).toEqual(before); expect(values).toEqual({ sentinel: "preserve" });
});
for (const mismatch of ["offer-target", "prompt-owner", "accepted-outcome"] as const) it(`does not canonicalize unproven legacy offer ${mismatch}`, async () => {
  const values = structuredClone(corpus("promotion-bottom-decline").promotionSource!);
  const state = (values.session as { state: GameState }).state;
  const owner = state.effectStack.find(f => f.costReplacementAction)!;
  // Historical public order destination opposes the printed destination.
  if (owner.costReplacementAction?.type !== "ARRANGE_TOP_CARDS") throw new Error("Expected legacy arrange");
  owner.costReplacementAction.destination = "top";
  if (mismatch === "offer-target") state.effectStack.at(-1)!.replacement!.targetInstanceId = "foreign";
  if (mismatch === "prompt-owner") state.pendingPrompt!.resumeContext = owner.id;
  if (mismatch === "accepted-outcome") owner.costReplacementResolution = "REPLACED";
  const { repo, values: actual } = memoryRepository(values); const before = structuredClone(actual);
  await expect(repo.load()).rejects.toThrow(); expect(actual).toEqual(before);
});

for (const mode of [6, 7] as const) it(`loaded8 preserves cost mode${mode} across live/undo save/load and first action`, async () => {
  const r = rig(); r.state.schemaVersion = 8; r.state.costSemanticsVersion = mode; r.deck(0, 5);
  r.state.players[0].donCostArea[0].state = "RESTED";
  const source = r.put("loaded8-don", 0, "CHARACTER", { schema: synSchema("loaded8-don", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_MINUS", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  const before = structuredClone(r.state);
  expect(toPersistedGameState(r.state).schemaVersion).toBe(8);
  const { repo, values } = memoryRepository();
  const saved = await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [r.state] });
  const loaded = (await repo.load())!;
  for (const state of [saved.state, ...saved.undoHistory, loaded.state, ...loaded.undoHistory]) {
    expect(state.schemaVersion).toBe(8); expect(state.costSemanticsVersion).toBe(mode);
  }
  expect(r.state).toEqual(before);
  expect((values.session as { state: GameState }).state.schemaVersion).toBe(8);
  const next = command(loaded.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, loaded.cardDb);
  expect(next.schemaVersion).toBe(8); expect(next.costSemanticsVersion).toBe(mode);
  if (mode === 6) {
    expect(next.pendingPrompt).toBeNull(); expect(next.players[0].hand).toHaveLength(1);
    expect(next.effectStack.every(frame => !frame.costExpectedRoot)).toBe(true);
  } else {
    expect(next.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(next.effectStack.some(frame => frame.costExpectedRoot)).toBe(true);
    expect(next.players[0].hand).toHaveLength(0);
  }
  await repo.save({ ...loaded, state: next });
  expect((await repo.load())!.state.costSemanticsVersion).toBe(mode);
});
