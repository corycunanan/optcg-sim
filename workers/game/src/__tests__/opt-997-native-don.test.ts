import { expect, it } from "vitest";
import { executeReturnDonToDeck } from "../engine/effect-resolver/actions/don.js";
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

for (const filter of [{ is_rested: true }, { state: "RESTED" }] as const) {
  for (const owner of [0, 1] as const) it(`native7 rested cost-area return honors ${JSON.stringify(filter)} for owner ${owner}`, () => {
    const { r, source } = fixture({ type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", controller: owner ? "OPPONENT" : "SELF", filter }, params: { amount: 1 } });
    const player = r.state.players[owner];
    const [active, rested, ...attached] = player.donCostArea;
    player.donCostArea = [active, { ...rested, state: "RESTED" }];
    player.leader.attachedDon = attached.map(d => ({ ...d, attachedTo: player.leader.instanceId }));
    const deckBefore = player.donDeck.map(d => d.instanceId);
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[owner].donCostArea.map(d => d.instanceId)).toEqual([active.instanceId]);
    expect(r.state.players[owner].leader.attachedDon).toHaveLength(attached.length);
    expect(r.state.players[owner].donDeck.map(d => d.instanceId)).toEqual([...deckBefore, rested.instanceId]);
    expect(r.state.players[0].hand).toHaveLength(1);
  });
  it(`native7 replacement rejects underpayment of rested pool ${JSON.stringify(filter)}`, () => {
    const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
    const source = r.put("OPT997-rested-insufficient", 0, "CHARACTER", { schema: synSchema("OPT997-rested-insufficient", [
      { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: [{ type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", filter }, params: { amount: 2 } }], flags: { optional: true } },
      { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
    ]) });
    r.state.players[0].donCostArea[0].state = "RESTED";
    const donorsBefore = structuredClone(r.state.players[0].donCostArea);
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[0].characters.every(c => c === null)).toBe(true);
    expect(r.state.players[0].donCostArea).toEqual(donorsBefore);
    expect(r.state.players[0].hand).toHaveLength(1);
  });
}

it("native7 state selectors are conjunctive and false flags impose no restriction", () => {
  for (const filter of [{ is_active: true, is_rested: true }, { is_active: true, state: "RESTED" }, { is_rested: true, state: "ACTIVE" }] as const) {
    const { r, source } = fixture({ type: "DRAW" });
    r.state.players[0].donCostArea[0].state = "RESTED";
    const before = structuredClone(r.state);
    const result = executeReturnDonToDeck(r.state, { type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", filter }, params: { amount: 1 } }, source.instanceId, 0, r.db, new Map());
    expect(result.pendingPrompt).toBeUndefined(); expect(result.succeeded).toBe(false); expect(result.state).toEqual(before);
  }
  for (const filter of [{ is_active: false }, { is_rested: false }, { is_active: false, is_rested: false }]) {
    const { r, source } = fixture({ type: "DRAW" });
    r.state.players[0].donCostArea[0].state = "RESTED";
    const result = executeReturnDonToDeck(r.state, { type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", filter }, params: { amount: 1 } }, source.instanceId, 0, r.db, new Map());
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    const options = result.pendingPrompt!.options;
    if (options.promptType !== "PLAYER_CHOICE") throw new Error("Expected donor choices");
    expect(new Set(options.donIdentityReturn!.groups.flatMap(g => g.donIds))).toEqual(new Set(r.state.players[0].donCostArea.map(d => d.instanceId)));
  }
});
it("native7 rested identity choices exclude active donors and consume the selected rested identity", () => {
  const { r, source } = fixture({ type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", filter: { is_rested: true } }, params: { amount: 1 } });
  const [active, free, held] = r.state.players[0].donCostArea;
  r.state.players[0].donCostArea = [active, { ...free, state: "RESTED" }, { ...held, state: "RESTED" }];
  r.state.prohibitions.push({ id: "OPT997-rested-hold", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "activate", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "THIS_TURN" }, controller: 0, appliesTo: [held.instanceId], usesRemaining: null } as never);
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(r.promptType()).toBe("PLAYER_CHOICE");
  const options = r.state.pendingPrompt!.options;
  if (options.promptType !== "PLAYER_CHOICE") throw new Error("Expected donor choices");
  expect(options.donIdentityReturn!.groups.flatMap(g => g.donIds).sort()).toEqual([free.instanceId, held.instanceId].sort());
  expect(options.choices).toHaveLength(2);
  r.act({ type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify([held.instanceId])}` });
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.players[0].donCostArea.map(d => d.instanceId)).toEqual([active.instanceId, free.instanceId]);
  expect(r.state.prohibitions).toHaveLength(0); expect(r.state.players[0].hand).toHaveLength(1);
});
it("ordinary6 retains its historical return behavior even with a rested filter", () => {
  const { r, source } = fixture({ type: "RETURN_DON_TO_DECK", target: { type: "DON_IN_COST_AREA", filter: { is_rested: true } }, params: { amount: 2 } }, 6);
  const before = r.state.players[0].donDeck.length;
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(r.state.players[0].donDeck).toHaveLength(before + 2); expect(r.state.players[0].hand).toHaveLength(1);
});
