import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command } from "./opt-997-corpus-support.js";
for (const version of [6, 7] as const) for (const type of ["KO_OWN_CHARACTER", "TRASH_OWN_CHARACTER"] as const) it(`zero ${type} version${version} performs no removal or replacement`, async () => {
  const r = rig(); r.state.schemaVersion = version; delete r.state.costSemanticsVersion; r.deck(0, 5);
  const source = r.put("zero-field", 0, "CHARACTER", { schema: synSchema("zero-field", [
    { id: "replace", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "DRAW", params: { amount: 2 } }] },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type, amount: 0 }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]) });
  // Legacy6 is a direct execution control; the ordinary repository now promotes.
  if (version === 7) await capture(r);
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.promptType()).toBe("SELECT_TARGET");
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [] }, r.db);
  expect(r.state.players[0].characters[0]!.instanceId).toBe(source.instanceId);
  expect(r.state.players[0].hand).toHaveLength(1); expect(r.state.players[0].deck).toHaveLength(4);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.eventLog.some(e => e.type === "CARD_KO" || e.type === "CARD_TRASHED")).toBe(false);
  if (version === 7) await capture(r);
});
