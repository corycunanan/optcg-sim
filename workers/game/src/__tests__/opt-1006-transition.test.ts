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
  expect(result.state.schemaVersion).toBe(process.env.OPT1001_WRITE_CORPUS ? 9 : 8);
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
