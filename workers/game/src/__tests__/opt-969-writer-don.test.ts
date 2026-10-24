import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { costRootMatches } from "../engine/effect-resolver/cost/transaction.js";
import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command } from "./opt-997-corpus-support.js";
import { computeCostTargets } from "../engine/effect-resolver/cost/targets.js";
import type { Cost, TargetFilter } from "../engine/effect-types.js";

function fixture(cost: Cost, owner: 0 | 1 = 0, version: 6 | 7 = 7) {
  const r = rig(); r.state.schemaVersion = version; r.state.turn.activePlayerIndex = owner; r.deck(owner, 5);
  const source = r.put("writer-don-source", owner, "CHARACTER", { schema: synSchema("writer-don-source", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [cost], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  return { r, source };
}
for (const owner of [0, 1] as const) for (const filter of [{ is_active: true }, { is_rested: true }, { state: "RESTED" }, { is_active: false }, { is_rested: false }, { is_active: false, is_rested: false }, { is_active: true, is_rested: true }, { is_rested: true, state: "ACTIVE" }] as TargetFilter[]) it(`native7 payer${owner} DON picker intersects ${JSON.stringify(filter)}`, async () => {
  const cost: Cost = { type: "DON_MINUS", amount: 1, filter };
  const { r, source } = fixture(cost, owner); const player = r.state.players[owner];
  const [active, rested, attached] = player.donCostArea;
  player.donCostArea = [active, { ...rested, state: "RESTED" }];
  source.attachedDon = [{ ...attached, attachedTo: source.instanceId }];
  const allowed = [
    ...(!filter.is_rested && (!filter.state || filter.state === "ACTIVE") ? [active.instanceId] : []),
    ...(!filter.is_active && (!filter.state || filter.state === "RESTED") ? [rested.instanceId] : []),
    ...(!filter.is_active && !filter.is_rested && !filter.state ? [attached.instanceId] : []),
  ];
  expect(computeCostTargets(r.state, cost, owner, r.db, source.instanceId).sort()).toEqual([...allowed].sort());
  const beforeOther = structuredClone(r.state.players[owner === 0 ? 1 : 0]); const deckBefore = player.donDeck.length;
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db, owner);
  if (!allowed.length) {
    expect(r.state.pendingPrompt).toBeNull(); expect(r.state.players[owner].donDeck).toHaveLength(deckBefore); expect(r.state.players[owner].hand).toHaveLength(0); return;
  }
  if (allowed.length === 1) {
    expect(r.state.pendingPrompt).toBeNull(); await capture(r);
    expect(r.state.players[owner].donDeck).toHaveLength(deckBefore + 1); expect(r.state.players[owner].hand).toHaveLength(1);
    expect(r.state.players[owner === 0 ? 1 : 0]).toEqual(beforeOther); return;
  }
  expect(r.promptType()).toBe("PLAYER_CHOICE"); await capture(r);
  const options = r.state.pendingPrompt!.options; if (options.promptType !== "PLAYER_CHOICE") throw new Error("Missing DON choice");
  expect(options.donIdentityReturn!.groups.flatMap(g => g.donIds).sort()).toEqual([...allowed].sort());
  const choiceId = `don-return-ids:${JSON.stringify([allowed[0]])}`;
  expect(options.choices.some(c => c.id === choiceId)).toBe(true);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId }, r.db, owner); await capture(r);
  expect(r.state.players[owner].donDeck).toHaveLength(deckBefore + 1); expect(r.state.players[owner].hand).toHaveLength(1);
  expect(r.state.players[owner === 0 ? 1 : 0]).toEqual(beforeOther); expect(r.state.effectStack).toHaveLength(0);
});
it("native7 variable return has a minimum of one and preserves exact attached identity choice", async () => {
  const { r, source } = fixture({ type: "VARIABLE_DON_RETURN" });
  source.attachedDon = r.state.players[0].donCostArea.map(d => ({ ...d, attachedTo: source.instanceId })); r.state.players[0].donCostArea = [];
  const count = source.attachedDon.length; const ids = source.attachedDon.slice(0, 2).map(d => d.instanceId);
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.promptType()).toBe("PLAYER_CHOICE"); await capture(r);
  const options = r.state.pendingPrompt!.options; if (options.promptType !== "PLAYER_CHOICE") throw new Error("Missing variable choice");
  expect(options.donIdentityReturn!.countMin).toBe(1); expect(options.donIdentityReturn!.countMax).toBe(count);
  expect(options.choices.some(c => c.id === "don-return-ids:[]")).toBe(false);
  const before = structuredClone(r.state); r.respond({ type: "PLAYER_CHOICE", choiceId: "don-return-ids:[]" }); expect(r.state).toEqual(before);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify(ids)}` }, r.db); await capture(r);
  expect(r.state.players[0].characters[0]!.attachedDon).toHaveLength(count - 2); expect(r.state.players[0].hand).toHaveLength(1);
});
for (const type of ["DON_MINUS", "VARIABLE_DON_RETURN"] as const) it(`numeric-zero ${type} creates no positive-bound picker`, async () => {
  const { r, source } = fixture({ type, amount: 0 }); const donors = structuredClone(r.state.players[0].donCostArea);
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db); await capture(r);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.players[0].donCostArea).toEqual(donors); expect(r.state.players[0].hand).toHaveLength(1);
});
it("ordinary6 retains historical automatic DON_MINUS payment", () => {
  const { r, source } = fixture({ type: "DON_MINUS", amount: 1 }, 0, 6);
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.players[0].hand).toHaveLength(1);
});

it("sole semantic DON plan automatically executes despite multiple equivalent donor IDs", async () => {
  const { r, source } = fixture({ type: "DON_MINUS", amount: 1 });
  const before = r.state.players[0].donDeck.length;
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db); await capture(r);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.players[0].donDeck).toHaveLength(before + 1); expect(r.state.players[0].hand).toHaveLength(1);
});
it("equal-state DON with different hold durations remain a meaningful choice", async () => {
  const { r, source } = fixture({ type: "DON_MINUS", amount: 1 });
  const [first, second] = r.state.players[0].donCostArea; r.state.players[0].donCostArea = [first, second];
  for (const [index, donor] of [first, second].entries()) r.state.prohibitions.push({ id: `writer-hold-${index}`, sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "activate", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: index ? "THIS_TURN" : "SKIP_NEXT_REFRESH" }, controller: 0, appliesTo: [donor.instanceId], usesRemaining: null } as never);
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db); await capture(r);
  expect(r.promptType()).toBe("PLAYER_CHOICE");
  const p = r.state.pendingPrompt!.options; if (p.promptType !== "PLAYER_CHOICE") throw new Error("Missing held donor choice");
  expect(p.choices).toHaveLength(2); expect(new Set(p.choices.map(c => c.label)).size).toBe(2);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify([second.instanceId])}` }, r.db); await capture(r);
  expect(r.state.players[0].donCostArea.map(d => d.instanceId)).toEqual([first.instanceId]);
  expect(r.state.prohibitions.map(p => p.id)).toEqual(["writer-hold-0"]);
});

it("public pipeline publishes new COST evidence once and rejects later root drift without mutation", () => {
  const { r, source } = fixture({ type: "DON_MINUS", amount: 1 });
  r.state.players[0].donCostArea[0].state = "RESTED";
  const original = structuredClone(r.state);
  const result = runPipeline(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db, 0);
  expect(result.valid).toBe(true); expect(r.state).toEqual(original);
  const owner = result.state.effectStack.find(frame => frame.costExpectedRoot)!;
  expect(costRootMatches(result.state, owner.costExpectedRoot!)).toBe(true);
  const changed = structuredClone(result.state);
  changed.players[0].donCostArea[0].state = "ACTIVE";
  const before = structuredClone(changed);
  const p = changed.pendingPrompt!.options;
  if (p.promptType !== "PLAYER_CHOICE") throw Error("missing DON choice");
  const reply = resumePromptLifecycle(changed, { type: "PLAYER_CHOICE", choiceId: p.choices[0].id }, r.db, { drainPregame: s => s, advanceStartOfTurn: s => s });
  expect(reply.responseRejected).toBe(true); expect(reply.state).toEqual(before); expect(changed).toEqual(before);
});

it("authored OP16-060 pays only active cost-area DON before its Admiral clause", async () => {
  // docs/cards/OP-16.md: return 8 active DON; given DON have no active/rested
  // state (rules v1.2.0 4-4-2), and cannot fill the printed active payment.
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  r.leader(0, "OP16-060");
  const leader = r.state.players[0].leader;
  const active = Array.from({ length: 8 }, (_, i) => ({ instanceId: `sengoku-active-${i}`, state: "ACTIVE" as const, attachedTo: null }));
  const rested = { instanceId: "sengoku-rested", state: "RESTED" as const, attachedTo: null };
  const given = { instanceId: "sengoku-given", state: "ACTIVE" as const, attachedTo: leader.instanceId };
  r.state.players[0].donCostArea = [...active, rested]; leader.attachedDon = [given];
  const beforeDeck = r.state.players[0].donDeck.length;
  const admiral = r.put("writer-admiral", 0, "HAND", { data: { types: ["Admiral"] } });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: leader.instanceId, effectId: "activate_return_active_don_play_admirals" }, r.db);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  expect(r.state.players[0].donCostArea).toEqual([rested]);
  expect(r.state.players[0].leader.attachedDon).toEqual([given]);
  expect(r.state.players[0].donDeck.slice(beforeDeck).map(d => d.instanceId).sort()).toEqual(active.map(d => d.instanceId).sort());
  expect(r.promptType()).toBe("SELECT_TARGET"); await capture(r);
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [admiral.instanceId] }, r.db); await capture(r);
  expect(r.state.players[0].hand).toEqual([]);
  expect(r.state.players[0].characters.some(c => c?.cardId === admiral.cardId)).toBe(true);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]);
});
