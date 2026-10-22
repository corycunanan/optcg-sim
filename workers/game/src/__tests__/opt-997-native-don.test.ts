import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import type { Action } from "../engine/effect-types.js";

function fixture(action: Action, version: 6 | 7 = 7) {
  const r = rig(); r.state.schemaVersion = version; r.deck(0, 5); r.deck(1, 5);
  const source = r.put("OPT997-native-don", 0, "CHARACTER", { schema: synSchema("OPT997-native-don", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [action, { type: "DRAW", params: { amount: 1 } }] }]) });
  return { r, source };
}
it("native7 amount returns the full all-attached field count; ordinary6 retains its historical amount path", () => {
  for (const version of [6, 7] as const) {
    const { r, source } = fixture({ type: "RETURN_DON_TO_DECK", params: { amount: 2 } }, version);
    source.attachedDon = r.state.players[0].donCostArea.map(d => ({ ...d, attachedTo: source.instanceId }));
    r.state.players[0].donCostArea = [];
    const count = source.attachedDon.length; const deckBefore = r.state.players[0].donDeck.length;
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
    expect(r.state.players[0].characters[0]!.attachedDon).toHaveLength(count - (version === 7 ? 2 : 0));
    expect(r.state.players[0].donDeck).toHaveLength(deckBefore + (version === 7 ? 2 : 0));
    expect(r.state.players[0].hand).toHaveLength(1);
  }
});
it("native7 opponent cost-area active domain excludes rested/attached DON and preserves the printed actor", () => {
  const { r, source } = fixture({ type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", controller: "OPPONENT", filter: { is_active: true } }, params: { amount: 1 } });
  const opponent = r.state.players[1]; const deckBefore = opponent.donDeck.map(d => d.instanceId); const own = r.state.players[0].donCostArea.length;
  const [active, rested, ...attached] = opponent.donCostArea;
  opponent.donCostArea = [active, { ...rested, state: "RESTED" }];
  opponent.leader.attachedDon = attached.map(d => ({ ...d, attachedTo: opponent.leader.instanceId }));
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(r.state.players[0].donCostArea).toHaveLength(own);
  expect(r.state.players[1].donCostArea.map(d => d.instanceId)).toEqual([rested.instanceId]);
  expect(r.state.players[1].leader.attachedDon).toHaveLength(attached.length);
  expect(r.state.players[1].donDeck.map(d => d.instanceId)).toEqual([...deckBefore, active.instanceId]);
});
it("native7 never offers a replacement that can only partially return its restricted active pool", () => {
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  const source = r.put("OPT997-insufficient", 0, "CHARACTER", { schema: synSchema("OPT997-insufficient", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: [{ type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", filter: { is_active: true } }, params: { amount: 2 } }], flags: { optional: true } },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]) });
  const [active, ...attached] = r.state.players[0].donCostArea;
  r.state.players[0].donCostArea = [active];
  source.attachedDon = attached.map(d => ({ ...d, attachedTo: source.instanceId }));
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.players[0].characters.every(c => c === null)).toBe(true);
  expect(r.state.players[0].hand).toHaveLength(1);
});
