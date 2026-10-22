/** OPT-969 reader-first coverage. The isolated mock is the proposed producer;
 * production still auto-pays DON costs until this reader is deployed. */
import { describe, expect, it, vi } from "vitest";
vi.mock("../engine/effect-resolver/cost/payability.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../engine/effect-resolver/cost/payability.js")>();
  return { ...actual, costNeedsPlayerSelection: (cost: import("../engine/effect-types.js").Cost) =>
    cost.type === "DON_MINUS" || cost.type === "VARIABLE_DON_RETURN" || actual.costNeedsPlayerSelection(cost) };
});
import { reloadLiveAndUndo } from "./opt-969-reader-fixtures.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { rig, synSchema } from "./opt-960-rig.js";
import type { Cost } from "../engine/effect-types.js";

for (const type of ["DON_MINUS", "VARIABLE_DON_RETURN"] as const) {
  describe(`OPT-969 ${type} reader`, () => {
    for (const reload of [false, true]) {
      it(`pays selected attached DON and advances suffix, reload=${reload}`, async () => {
        const r = rig();
        r.deck(0, 5);
        const source = r.put(`OPT969-${type}`, 0, "CHARACTER", { schema: synSchema(`OPT969-${type}`, [{
          id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" },
          costs: [{ type, amount: 1 }, { type: "REST_DON", amount: 1 }],
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        }]) });
        const donor = r.state.players[0].donCostArea.pop()!;
        source.attachedDon = [{ ...donor, attachedTo: source.instanceId }];
        const before = r.state.players[0].donDeck.length;
        const powerBefore = getEffectivePower(source, r.db.get(source.cardId)!, r.state, r.db);
        r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
        expect(r.promptType()).toBe("SELECT_TARGET");
        if (reload) await reloadLiveAndUndo(r);
        r.select([donor.instanceId]);
        expect(r.state.pendingPrompt).toBeNull();
        expect(r.state.effectStack).toHaveLength(0);
        expect(r.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!.attachedDon).toHaveLength(0);
        expect(r.state.players[0].donDeck).toHaveLength(before + 1);
        const after = r.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!;
        expect(getEffectivePower(after, r.db.get(after.cardId)!, r.state, r.db)).toBe(powerBefore - 1000);
        expect(r.state.eventLog.filter(e => e.type === "DON_DETACHED")).toHaveLength(1);
        expect(r.state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(1);
        expect(r.state.players[0].deck).toHaveLength(4);
        expect(r.state.players[0].hand).toHaveLength(1);
      });
    }
    it("restricts active-cost-area wording and rejects attached selection", () => {
      const r = rig(); r.deck(0, 5);
      const costs: Cost[] = [{ type, amount: 1, filter: { is_active: true } }];
      const source = r.put(`OPT969-${type}`, 0, "CHARACTER", { schema: synSchema(`OPT969-${type}`, [{
        id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs,
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }]) });
      const donor = r.state.players[0].donCostArea.pop()!;
      source.attachedDon = [{ ...donor, attachedTo: source.instanceId }];
      r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
      const before = structuredClone(r.state);
      const result = r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [donor.instanceId] });
      expect(result.rejected).toBe(true);
      expect(r.state).toEqual(before);
    });
  });
}

it("DON cost reader rejects stale identities, duplicates, underpayment and foreign IDs without publishing", async () => {
  const r = rig(); r.deck(0, 5);
  const source = r.put("OPT969-count", 0, "CHARACTER", { schema: synSchema("OPT969-count", [{ id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_MINUS", amount: 2 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
  await reloadLiveAndUndo(r);
  const [first, second] = r.state.players[0].donCostArea;
  for (const ids of [[], [first.instanceId], [first.instanceId, first.instanceId], [first.instanceId, "foreign"]]) {
    const before = structuredClone(r.state);
    r.respond({ type: "SELECT_TARGET", selectedInstanceIds: ids });
    expect(r.state).toEqual(before);
  }
  // Live state no longer contains one offered identity; staged state still does.
  r.state.players[0].donCostArea = r.state.players[0].donCostArea.filter(d => d.instanceId !== second.instanceId);
  const before = structuredClone(r.state);
  r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [first.instanceId, second.instanceId] });
  expect(r.state).toEqual(before);
});

it("variable reader accepts a positive selected count, and suffix terminal checkpoint keeps DON payment", async () => {
  const r = rig(); r.deck(0, 1);
  const source = r.put("OPT969-variable", 0, "CHARACTER", { schema: synSchema("OPT969-variable", [{ id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "VARIABLE_DON_RETURN" }, { type: "MILL", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  const beforeDeck = r.state.players[0].donDeck.length;
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
  // The test-only generic producer offers count1 today; reader accepts the
  // same frame's positive variable count, as the future writer will offer.
  if (r.state.pendingPrompt?.options.promptType === "SELECT_TARGET") r.state.pendingPrompt.options.countMax = 3;
  await reloadLiveAndUndo(r);
  r.select(r.state.players[0].donCostArea.slice(0, 3).map(d => d.instanceId));
  expect(r.state.status).toBe("FINISHED");
  expect(r.state.players[0].donDeck).toHaveLength(beforeDeck + 3);
  expect(r.state.players[0].deck).toHaveLength(0);
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.gameOvers()).toHaveLength(1);
});


it("reads an offered PLAYER_CHOICE identity plan on the existing cost owner after live+undo reload", async () => {
  const r = rig(); r.deck(0, 5);
  const source = r.put("OPT969-plan", 0, "CHARACTER", { schema: synSchema("OPT969-plan", [{ id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_MINUS", amount: 2 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
  const ids = r.state.players[0].donCostArea.slice(0, 2).map(d => d.instanceId);
  const choiceId = `don-return-ids:${JSON.stringify(ids)}`;
  // Isolated synthetic producer shape; the checked-in corpus additionally
  // proves payloads emitted by pinned actual writer code.
  const frame = r.state.effectStack.at(-1)!;
  frame.validTargets.push(choiceId);
  r.state.pendingPrompt!.options = { promptType: "PLAYER_CHOICE", effectDescription: "Choose DON!! to return", choices: [{ id: choiceId, label: "Return 2 active DON!!" }] };
  await reloadLiveAndUndo(r);
  const before = structuredClone(r.state);
  r.respond({ type: "PLAYER_CHOICE", choiceId: 'don-return-ids:["foreign"]' });
  expect(r.state).toEqual(before);
  r.act({ type: "PLAYER_CHOICE", choiceId });
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.players[0].donCostArea).toHaveLength(6);
  expect(r.state.players[0].deck).toHaveLength(4);
});
