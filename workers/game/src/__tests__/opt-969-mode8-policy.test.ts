/** OPT-958 / Decision10 KNOWN RULES DEVIATION, authored reachable combination.
 * ST22-005 Oden + OP17-043 Ganzui, docs/cards/ST-22.md and OP-17.md.
 * Retained policy restores3 earlier DON and does not consume Oden use after
 * substitute payment. Rule-literal paid-portion outcome retains3 rested DON
 * (8-3-1-3-1); consuming use (10-2-13-5) for replaced costs remains an assumed
 * reading, without a specific official multicost ruling. This passing
 * compatibility fixture is not conformance and does not close OPT-958.
 */
import { expect, it } from "vitest";
import { rig } from "./opt-960-rig.js";
import { command, capture } from "./opt-997-corpus-support.js";

for (const reload of [false, true]) for (const accept of [false, true]) it(`mode8 authored Oden/Ganzui retained policy accept=${accept} reload=${reload}`, async () => {
  const r = rig(); r.state.schemaVersion = 8; r.state.costSemanticsVersion = 8; r.deck(0, 5); r.deck(1, 5);
  r.leader(0, "OP01-060");
  const source = r.put("ST22-005", 0, "CHARACTER", { state: "RESTED" });
  const target = r.put("OP17-043", 0, "CHARACTER");
  for (let i = 0; i < 3; i++) r.put(`policy-hand-${i}`, 0, "HAND");
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate_set_active" }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (reload) await capture(r);
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  if (reload) await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" }, r.db);
  if (accept) {
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (reload) await capture(r);
    const prompt = r.state.pendingPrompt!.options;
    if (prompt.promptType !== "SELECT_TARGET") throw new Error("missing hand payment");
    r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: prompt.validTargets.slice(0, 2) }, r.db);
  }
  if (reload) await capture(r);
  expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(accept ? 0 : 3);
  expect(r.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!.state).toBe(accept ? "RESTED" : "ACTIVE");
  expect(r.state.players[0].characters.some(c => c?.instanceId === target.instanceId)).toBe(accept);
  expect(r.state.players[0].hand).toHaveLength(accept ? 1 : 4);
  expect(r.state.turn.oncePerTurnUsed.activate_set_active?.includes(source.instanceId) ?? false).toBe(!accept);
  if (accept) {
    r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate_set_active" }, r.db);
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: "accept" }, r.db);
    const prompt = r.state.pendingPrompt!.options;
    if (prompt.promptType !== "SELECT_TARGET") throw new Error("missing retry selection");
    r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] }, r.db);
    expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!.state).toBe("ACTIVE");
    expect(r.state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(3);
    expect(r.state.players[0].characters.some(c => c?.instanceId === target.instanceId)).toBe(false);
    expect(r.state.players[0].hand).toHaveLength(2);
    expect(r.state.turn.oncePerTurnUsed.activate_set_active?.includes(source.instanceId)).toBe(true);
  }

});
