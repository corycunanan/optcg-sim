import { expect, it, vi } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import { SessionCoordinator } from "../session/coordinator.js";
import * as roots from "../engine/effect-resolver/cost/transaction.js";
import { rig, synSchema } from "./opt-960-rig.js";
function fixture() {
  const r = rig(); r.deck(0, 10); r.deck(1, 10); r.state = { ...r.state, schemaVersion: 8, costSemanticsVersion: 8 };
  r.put("OPT1006-NOMATCH", 0, "CHARACTER");
  const source = r.put("OPT1006-TRANSITION", 1, "HAND", { schema: synSchema("OPT1006-TRANSITION", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } }] }], "Event"), data: { type: "Event", cost: 0, power: null, effectText: "[Main] Trash opponent Characters." } });
  r.state.turn.activePlayerIndex = 1;
  return { r, action: { type: "PLAY_CARD" as const, cardInstanceId: source.instanceId } };
}
it("field-trash execution preserves original input8, including no-match writer activation", () => {
  const { r, action } = fixture(); const before = structuredClone(r.state);
  const result = runPipeline(r.state, action, r.db, 1);
  expect(result.valid).toBe(true); expect(r.state).toEqual(before); expect(r.state.schemaVersion).toBe(8);
  expect(result.state.schemaVersion).toBe(9);
});
it("rejected publication after field-trash execution returns original8 and unchanged undo", () => {
  const { r, action } = fixture(); const initial = r.state; const before = structuredClone(initial);
  // Fault injection at the actual post-pipeline publication guard; this tests
  // the rollback boundary, not whether a valid authored history is ambiguous.
  const gate = vi.spyOn(roots, "publishCostOwnerRoots").mockReturnValue(undefined);
  try {
    const result = new SessionCoordinator().executeAction(initial, [initial], 1, action, r.db);
    expect(result.kind).toBe("reject"); expect(result.state).toBe(initial); expect(result.state).toEqual(before); expect(result.undoHistory).toEqual([initial]);
  } finally { gate.mockRestore(); }
});

for (const mode of [6, 7, 8] as const) it(`explicit native8 mode${mode} activates only the scalar, with identical IDs/RNG/events to native9`, () => {
  const { r, action } = fixture(); r.state.costSemanticsVersion = mode;
  const before = structuredClone(r.state);
  const result = runPipeline(r.state, action, r.db, 1);
  const alreadyNative = runPipeline({ ...r.state, schemaVersion: 9 }, action, r.db, 1);
  expect(result.valid).toBe(true); expect(result.state).toEqual(alreadyNative.state);
  expect(result.state.eventLog).toEqual(alreadyNative.state.eventLog);
  expect(result.state).toMatchObject({ schemaVersion: 9, costSemanticsVersion: mode });
  expect(r.state).toEqual(before);
});
for (const version of [undefined, 6, 7] as const) it(`raw historical pipeline source${version} does not invent a native9 cost mode`, () => {
  const { r, action } = fixture(); r.state.schemaVersion = version; delete r.state.costSemanticsVersion;
  const before = structuredClone(r.state);
  const result = runPipeline(r.state, action, r.db, 1);
  expect(result.valid).toBe(true); expect(result.state.schemaVersion).toBe(version);
  expect(result.state.costSemanticsVersion).toBeUndefined(); expect(r.state).toEqual(before);
});
for (const version of [6, 7] as const) for (const viaRepository of [false, true]) it(`typed historical source${version} through ${viaRepository ? "Repository/" : ""}Coordinator activates validated8/mode7 then writer9 immutably`, async () => {
  const { r, action } = fixture(); r.state.schemaVersion = version; delete r.state.costSemanticsVersion;
  const before = structuredClone(r.state);
  const { SessionRepository } = await import("../session/persistence.js");
  const { MemorySessionStorage } = await import("./fixtures/opt-940-synthetic-states.js");
  const repo = new SessionRepository(new MemorySessionStorage(), { nextJsUrl: "https://x.test", workerSecret: "s" });
  const snapshot = viaRepository ? await repo.save({ state: r.state, cardDb: r.db, undoHistory: [r.state], mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null }) : { state: r.state, undoHistory: [r.state] };
  if (viaRepository) expect(snapshot.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 7 });
  const result = new SessionCoordinator().executeAction(snapshot.state, snapshot.undoHistory, 1, action, r.db);
  expect(result.kind).toBe("applied"); expect(result.state).toMatchObject({ schemaVersion: 9, costSemanticsVersion: 7 });
  const saved = await repo.save({ state: result.state, cardDb: r.db, undoHistory: result.undoHistory, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
  expect(saved.state.schemaVersion).toBe(9); expect(r.state).toEqual(before);
});
it("actual synchronous writer transition retains pre8 undo; floor Repository/Coordinator restores it unchanged", async () => {
  const { r, action } = fixture(); const before = structuredClone(r.state);
  const produced = new SessionCoordinator().executeAction(r.state, [], 1, action, r.db);
  expect(produced.kind).toBe("applied"); expect(produced.state.schemaVersion).toBe(9);
  expect(produced.undoHistory).toEqual([before]); expect(r.state).toEqual(before);
  const { runtime, memory } = await import("./native7-producer-support.js");
  const floor = await runtime(process.env.OPT1006_WRITER_FLOOR_ROOT);
  const saved = memory(floor);
  await saved.repo.save({ state: produced.state, cardDb: r.db, undoHistory: produced.undoHistory, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
  const loaded = (await saved.repo.load())!;
  expect(loaded.state.schemaVersion).toBe(9); expect(loaded.undoHistory[0].schemaVersion).toBe(8);
  const undone = new floor.SessionCoordinator().executeAction(loaded.state, loaded.undoHistory, 1, { type: "UNDO" }, loaded.cardDb);
  expect(undone.kind).toBe("undo"); expect(undone.state).toEqual(loaded.undoHistory[0]);
  expect(undone.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 });
});
