import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { isCostSequencePayable, isCostSequencePayableWithoutPrune } from "../engine/effect-resolver/cost/feasibility.js";
import { isCostPayable } from "../engine/effect-resolver/cost/payability.js";
import { payCosts } from "../engine/effect-resolver/cost/payment.js";
import type { Cost } from "../engine/effect-types.js";
function fixture() { const r = rig(); r.state.costSemanticsVersion = 8; return r; }

for (const type of ["DON_MINUS", "VARIABLE_DON_RETURN"] as const) for (const amount of [-2, -1, 0]) it(`${type}${amount} is an actual and hypothetical no-op in mode8`, () => {
  const r = fixture(); const before = structuredClone(r.state); const cost: Cost = { type, amount };
  expect(isCostSequencePayable(r.state, [cost], 0, r.db, r.state.players[0].leader.instanceId)).toBe(true);
  const paid = payCosts(r.state, [cost], 0, r.db, r.state.players[0].leader.instanceId)!;
  expect.soft(paid.state).toEqual(before); expect.soft(paid.events).toEqual([]);
  expect(r.state).toEqual(before);
  r.deck(0, 5); r.deck(1, 5);
  const source = r.put(`nonpositive-${type}-${amount}`, 0, "CHARACTER", { schema: synSchema(`nonpositive-${type}-${amount}`, [{
    id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [cost, { type: "REST_DON", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]) });
  const area = structuredClone(r.state.players[0].donCostArea); const deck = structuredClone(r.state.players[0].donDeck);
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(r.state.players[0].donDeck).toEqual(deck);
  expect(r.state.players[0].donCostArea).toEqual(area.map((d, i) => i === 0 ? { ...d, state: "RESTED" } : d));
  expect(r.state.players[0].hand).toHaveLength(1); expect(r.state.pendingPrompt).toBeNull();
});

it("mode8 DON exact choices match independent resource arithmetic and exhaustive prune oracle", () => {
  const r = fixture(); const donors = [...r.state.players[0].donCostArea, ...r.state.players[0].donDeck];
  let cases = 0;
  for (let active = 0; active <= 10; active += 2) for (let rested = 0; rested <= 10 - active; rested += 2) {
    const p = r.state.players[0];
    p.donCostArea = donors.slice(0, active + rested).map((d, i) => ({ ...d, state: i < active ? "ACTIVE" : "RESTED", attachedTo: null }));
    p.donDeck = []; p.leader.attachedDon = donors.slice(active + rested).map(d => ({ ...d, attachedTo: p.leader.instanceId }));
    for (const amount of [0, 1, 3, 5]) for (const rest of [1, 3, 6]) for (const restricted of [false, true]) {
      const costs: Cost[] = [{ type: "DON_MINUS", amount, ...(restricted ? { filter: { is_active: true } } : {}) }, { type: "REST_DON", amount: rest }];
      const expected = active >= rest && (restricted ? active >= amount + rest : donors.length >= amount + rest);
      const before = structuredClone(r.state);
      expect(isCostSequencePayable(r.state, costs, 0, r.db, p.leader.instanceId), JSON.stringify({active,rested,amount,rest,restricted})).toBe(expected);
      expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, p.leader.instanceId)).toBe(expected);
      expect(r.state).toEqual(before); cases++;
    }
  }
  process.stderr.write(`OPT969 mode8 independent DON sequences=${cases}\n`);
});

it("mode8 variable omitted count requires one and state filters intersect", () => {
  const r = fixture(); const p = r.state.players[0]; const [active, ...rest] = p.donCostArea;
  p.donCostArea = [active]; p.leader.attachedDon = rest.map(d => ({ ...d, attachedTo: p.leader.instanceId }));
  const variable: Cost = { type: "VARIABLE_DON_RETURN" };
  expect(isCostSequencePayable(r.state, [variable, { type: "REST_DON", amount: 1 }], 0, r.db, p.leader.instanceId)).toBe(true);
  for (const filter of [{ is_active: true, is_rested: true }, { is_active: true, state: "RESTED" as const }]) {
    const cost: Cost = { type: "DON_MINUS", amount: 1, filter };
    expect(isCostSequencePayable(r.state, [cost], 0, r.db, p.leader.instanceId)).toBe(false);
    expect(isCostPayable(r.state, cost, 0, r.db, p.leader.instanceId)).toBe(false);
  }
  p.donCostArea = []; p.leader.attachedDon = [];
  expect(isCostSequencePayable(r.state, [variable], 0, r.db, p.leader.instanceId)).toBe(false);
  expect(isCostPayable(r.state, variable, 0, r.db, p.leader.instanceId)).toBe(false);
});

it("private transition allocations conserve authoritative state and genuine identity corruption propagates", () => {
  const r = fixture(); r.deck(0, 5); r.deck(1, 5); r.put("private-hand", 0, "HAND");
  const costs: Cost[] = [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "REST_DON", amount: 1 }];
  const source = r.put("private-source", 0, "CHARACTER", { schema: synSchema("private-source", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs, actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  const before = structuredClone(r.state); const ref = r.state.players[0].leader;
  for (let i = 0; i < 3; i++) expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(true);
  expect(r.state).toEqual(before); expect(r.state.players[0].leader).toBe(ref);
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(r.promptType()).toBe("SELECT_TARGET"); r.select([r.state.players[0].hand[0].instanceId]);
  expect(r.state.players[0].hand).toHaveLength(1); expect(r.state.effectStack).toHaveLength(0);
  const broken = fixture(); broken.put("corrupt-hand", 0, "HAND"); broken.state.executionContext.idCounter = 0;
  const damaged = structuredClone(broken.state);
  expect(() => isCostSequencePayable(broken.state, costs, 0, broken.db, broken.state.players[0].leader.instanceId)).toThrow(/instance id collision/);
  expect(broken.state).toEqual(damaged);
});

it("measures complete bounded physical DON rejection and synthetic lazy scaling", () => {
  const r = fixture(); const p = r.state.players[0]; p.donCostArea.push(...p.donDeck); p.donDeck = [];
  const start = performance.now();
  expect(isCostSequencePayable(r.state, [{ type: "DON_MINUS", amount: 5 }, { type: "REST_DON", amount: 6 }], 0, r.db, p.leader.instanceId)).toBe(false);
  const rejection = performance.now() - start;
  const big = fixture(); const q = big.state.players[0];
  q.donCostArea = Array.from({ length: 60 }, (_, i) => ({ instanceId: `scale-don-${i}`, state: "ACTIVE", attachedTo: null }));
  const lazyStart = performance.now();
  expect(isCostSequencePayable(big.state, [{ type: "DON_MINUS", amount: 30 }, { type: "REST_DON", amount: 1 }], 0, big.db, q.leader.instanceId)).toBe(true);
  const lazy = performance.now() - lazyStart;
  process.stderr.write(`OPT969 mode8 physical C(10,5)=252 rejection=${rejection.toFixed(2)}ms synthetic C(60,30) first-witness=${lazy.toFixed(2)}ms\n`);
  expect(rejection).toBeLessThan(500); expect(lazy).toBeLessThan(500);
});
