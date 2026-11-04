import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { command, capture } from "./opt-997-corpus-support.js";

// Synthetic new-game writer fixtures, never retagged recorded inputs.
for (const reload of [false, true]) it(`mode8 DON payment starts and completes fresh Life watcher reload=${reload}`, async () => {
  const r = rig(); expect(r.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 });
  r.deck(0, 5); r.deck(1, 5); r.leader(0, "ST13-003"); r.life(0, 1); r.state.players[0].life[0].face = "UP";
  const p = r.state.players[0]; const [active, donor, ...reserve] = p.donCostArea;
  p.donCostArea = [active]; p.donDeck.push(...reserve); p.leader.attachedDon = [{ ...donor, attachedTo: p.leader.instanceId }];
  r.put("mode8-watcher", 0, "CHARACTER", { schema: synSchema("mode8-watcher", [{
    id: "watch", category: "auto", trigger: { event: "DON_RETURNED_TO_DON_DECK" }, flags: { optional: true },
    costs: [{ type: "LIFE_TO_HAND", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]) });
  const source = r.put("mode8-don", 0, "CHARACTER", { schema: synSchema("mode8-don", [{
    id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { optional: true },
    costs: [{ type: "DON_MINUS", amount: 1 }, { type: "REST_DON", amount: 1 }],
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
  }]) });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  expect(r.promptType()).toBe("PLAYER_CHOICE"); if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify([donor.instanceId])}` }, r.db);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  if (reload) await capture(r);
  expect(r.state.costSemanticsVersion).toBe(8); expect(r.state.players[0].life).toHaveLength(0);
  expect(r.state.players[0].deck).toHaveLength(6); expect(r.state.players[0].hand).toHaveLength(0);
  expect(r.state.players[0].leader.attachedDon).toHaveLength(0);
  expect(r.state.players[0].donCostArea).toEqual([{ ...active, state: "RESTED" }]);
  expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
});

it("mode8 EOB sees its THIS_BATTLE power through the cost option, then expires once", async () => {
  const { endPhaseRig, synSchema: endSchema } = await import("./opt-962-rig.js");
  const { getEffectivePower } = await import("../engine/modifiers.js");
  const r = endPhaseRig(); expect(r.state.costSemanticsVersion).toBe(8);
  const source = r.putSyn("mode8-eob-power", endSchema("mode8-eob-power", "Character", [
    { id: "attack-buff", category: "auto", trigger: { keyword: "WHEN_ATTACKING" }, actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 2000 }, duration: { type: "THIS_BATTLE" } }] },
    { id: "eob-cost", category: "auto", trigger: { event: "END_OF_BATTLE" }, conditions: { type: "SELF_POWER", operator: ">=", value: 6000 }, flags: { optional: true }, costs: [{ type: "REST_DON", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]), 0, "CHARACTER", { power: 4000 });
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: source.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
  r.act({ type: "PASS" }, 1); r.act({ type: "PASS" }, 1);
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  expect(getEffectivePower(source, r.db.get(source.cardId)!, r.state, r.db)).toBe(6000);
  expect(r.state.activeEffects.some(e => e.sourceCardInstanceId === source.instanceId && e.duration.type === "THIS_BATTLE")).toBe(true);
  const { runtime, memory, save } = await import("./native7-producer-support.js");
  const rt = await runtime();
  r.state = (await memory(rt, await save(rt, r.state, r.db)).repo.load())!.state;
  expect(getEffectivePower(r.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!, r.db.get(source.cardId)!, r.state, r.db)).toBe(6000);
  const before = r.state.players[0].hand.length;
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db, 0);
  expect(r.state.players[0].hand).toHaveLength(before + 1);
  expect(getEffectivePower(r.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!, r.db.get(source.cardId)!, r.state, r.db)).toBe(4000);
  expect(r.state.activeEffects.some(e => e.sourceCardInstanceId === source.instanceId && e.duration.type === "THIS_BATTLE")).toBe(false);
  expect(r.state.eventLog.filter(e => e.type === "BATTLE_RESOLVED")).toHaveLength(1);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
});

it("mode8 EB04-030 insufficient field DON does not offer or save its replacement", () => {
  const r = rig(); expect(r.state.costSemanticsVersion).toBe(8); r.deck(0, 5); r.deck(1, 5);
  const target = r.put("EB04-030", 0, "CHARACTER");
  r.state.players[0].donDeck.push(...r.state.players[0].donCostArea); r.state.players[0].donCostArea = [];
  const source = r.put("mode8-remove-kaido", 1, "CHARACTER", { schema: synSchema("mode8-remove-kaido", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } }] }]) });
  r.state.turn.activePlayerIndex = 1;
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db, 1);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.players[0].characters.some(c => c?.instanceId === target.instanceId)).toBe(false);
  expect(r.state.players[0].trash.some(c => c.cardId === "EB04-030")).toBe(true);
});
