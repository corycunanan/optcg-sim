/**
 * OPT-961 round 1, finding B — the sequence prune never rejects a payable
 * sequence, and it rejects the large failed-selection shapes before any
 * combination is enumerated.
 *
 * `sequenceFailsNecessaryCondition` (cost/feasibility.ts) states the
 * soundness argument. This file checks it against the unpruned search on
 * 500 seeded random sequences over small zones, where the exhaustive search is
 * cheap, and pins the four large shapes the review measured. The timing side
 * of those shapes runs in the capped child processes of
 * opt-961-scale-harness.test.ts (scenarios X0-X3).
 */
import { describe, expect, it } from "vitest";
import type { CardInstance, GameState } from "../types.js";
import type { Cost, RuntimeProhibition } from "../engine/effect-types.js";
import {
  isCostSequencePayable,
  isCostSequencePayableWithoutPrune,
  sequenceFailsNecessaryCondition,
  sequenceFailsStableTargetCondition,
} from "../engine/effect-resolver/cost/feasibility.js";
import { computeCostTargets } from "../engine/effect-resolver/cost/targets.js";
import { rig, type Rig } from "./opt-960-rig.js";

const P0 = 0 as const;

const POOL: Cost[] = [
  { type: "TRASH_FROM_HAND", amount: 1 },
  { type: "TRASH_FROM_HAND", amount: 2 },
  { type: "PLACE_HAND_TO_DECK", amount: 1 },
  { type: "PLACE_HAND_TO_DECK", amount: 2 },
  { type: "MILL", amount: 1 },
  { type: "MILL", amount: 3 },
  { type: "REST_DON", amount: 1 },
  { type: "DON_REST", amount: 2 },
  { type: "REST_SELF" },
  { type: "REST_SELF", target: { type: "YOUR_LEADER" } },
  { type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1 },
  { type: "LIFE_TO_HAND", amount: 1, position: "TOP" },
  { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1 },
  { type: "TRASH_SELF" },
  { type: "CHOOSE_ONE_COST", options: [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "LIFE_TO_HAND", amount: 1, position: "TOP" }] },
];

/** Deterministic PRNG (mulberry32). */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomState(rand: () => number): { r: Rig; source: CardInstance } {
  const r = rig();
  const n = (max: number) => Math.floor(rand() * (max + 1));
  r.deck(P0, n(4));
  r.life(P0, n(2));
  for (let i = 0, h = n(4); i < h; i++) r.put(`prune-hand-${i}`, P0, "HAND");
  for (let i = 0, t = n(2); i < t; i++) r.put(`prune-trash-${i}`, P0, "TRASH");
  if (rand() < 0.5) r.put("prune-other", P0, "CHARACTER");
  const source = r.put("prune-source", P0, "CHARACTER", { state: rand() < 0.5 ? "ACTIVE" : "RESTED" });
  const active = n(3);
  r.state.players[P0].donCostArea = r.state.players[P0].donCostArea.map((d, i) => ({
    ...d, state: i < active ? "ACTIVE" as const : "RESTED" as const,
  }));
  if (rand() < 0.3) r.state.players[P0].leader = { ...r.state.players[P0].leader, state: "RESTED" };
  return { r, source };
}

describe("OPT-961 sequence prune", () => {
  it("agrees with the unpruned search on 500 seeded random sequences", () => {
    const rand = prng(961);
    let pruned = 0;
    let payable = 0;
    for (let i = 0; i < 500; i++) {
      const { r, source } = randomState(rand);
      const length = 2 + Math.floor(rand() * 3);
      const costs = Array.from({ length }, () => POOL[Math.floor(rand() * POOL.length)]);
      const state: GameState = r.state;
      const exhaustive = isCostSequencePayableWithoutPrune(state, costs, P0, r.db, source.instanceId);
      const fast = isCostSequencePayable(state, costs, P0, r.db, source.instanceId);
      expect(fast, JSON.stringify({ i, costs })).toBe(exhaustive);
      if (sequenceFailsNecessaryCondition(state, costs, P0, source.instanceId)) {
        // Soundness: a prune rejection is never a payable sequence.
        expect(exhaustive, JSON.stringify({ i, costs })).toBe(false);
        pruned++;
      }
      if (exhaustive) payable++;
    }
    // The sample exercises both outcomes and the prune itself.
    expect(pruned).toBeGreaterThan(30);
    expect(payable).toBeGreaterThan(30);
  }, 60_000);

  it("an earlier cost that refills a zone disables that zone's prune", () => {
    const r = rig();
    r.deck(P0, 0);
    r.put("prune-hand", P0, "HAND");
    const source = r.put("prune-source", P0, "CHARACTER");
    // PLACE_HAND_TO_DECK fills the deck MILL reads: not pruned, and payable.
    const costs: Cost[] = [{ type: "PLACE_HAND_TO_DECK", amount: 1 }, { type: "MILL", amount: 1 }];
    expect(sequenceFailsNecessaryCondition(r.state, costs, P0, source.instanceId)).toBe(false);
    expect(isCostSequencePayable(r.state, costs, P0, r.db, source.instanceId)).toBe(true);
  });

  describe("rejects the review's large failed-selection shapes before branching", () => {
    function large(costs: Cost[]) {
      const r = rig();
      r.deck(P0, 20);
      for (let i = 0; i < 28; i++) r.put(`prune-hand-${i}`, P0, "HAND");
      const source = r.put("prune-source", P0, "CHARACTER", { state: "RESTED" });
      expect(sequenceFailsNecessaryCondition(r.state, costs, P0, source.instanceId)).toBe(true);
      expect(isCostSequencePayable(r.state, costs, P0, r.db, source.instanceId)).toBe(false);
    }
    it("X0 (Codex): REST_DON 1, TRASH_FROM_HAND 8, rested REST_SELF", () =>
      large([{ type: "REST_DON", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 8 }, { type: "REST_SELF" }]));
    it("X1: PLACE_HAND_TO_DECK 3, rested REST_SELF", () =>
      large([{ type: "PLACE_HAND_TO_DECK", amount: 3 }, { type: "REST_SELF" }]));
    it("X2: PLACE_HAND_TO_DECK 4, rested REST_SELF", () =>
      large([{ type: "PLACE_HAND_TO_DECK", amount: 4 }, { type: "REST_SELF" }]));
    it("X3: TRASH_FROM_HAND 2, TRASH_FROM_HAND 2, rested REST_SELF", () =>
      large([{ type: "TRASH_FROM_HAND", amount: 2 }, { type: "TRASH_FROM_HAND", amount: 2 }, { type: "REST_SELF" }]));
  });
});

describe("OPT-986 stable target prune", () => {
  it("agrees with exhaustive search on 6500 seeded filter/prohibition sequences", () => {
    const rand = prng(986);
    let rejected = 0;
    let payable = 0;
    const r = rig();
    r.deck(0, 0);
    r.deck(1, 0);
    r.life(0, 0);
    r.life(1, 0);
    const blank = structuredClone(r.state);
    for (let i = 0; i < 6500; i++) {
      r.state = structuredClone(blank);
      const size = 2 + Math.floor(rand() * 5);
      for (let j = 0; j < size; j++) r.put(`sample-hand-${j}`, 0, "HAND", { data: { name: rand() < 0.3 ? "match" : "other" } });
      const source = r.put("sample-source", 0, "CHARACTER");
      const amount = 1 + Math.floor(rand() * (size - 1));
      const filterCase = i % 2 === 0;
      if (!filterCase) {
        const dynamic = rand() < 0.5;
        r.state.prohibitions.push({
          id: "hold", sourceCardInstanceId: rand() < 0.2 ? r.state.players[0].hand[0].instanceId : source.instanceId,
          sourceEffectBlockId: "hold", prohibitionType: "CANNOT_BE_RESTED", scope: { cause: "ANY" },
          duration: { type: "PERMANENT" }, controller: 0, appliesTo: [source.instanceId], usesRemaining: null,
          ...(dynamic ? { conditions: { type: "HAND_COUNT" as const, controller: "SELF" as const, operator: ">=" as const, value: size } } : {}),
        });
      }
      const costs: Cost[] = [
        { type: rand() < 0.5 ? "TRASH_FROM_HAND" : "PLACE_HAND_TO_DECK", amount },
        filterCase ? { type: "TRASH_FROM_HAND", amount: 1, filter: { name: rand() < 0.5 ? "missing" : "match" } }
          : { type: "REST_CARDS", amount: 1 },
      ];
      // Also exercise a replenishing prefix that must disable the lookahead.
      if (i % 7 === 0) costs.unshift({ type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1 });
      const before = JSON.stringify(r.state);
      const exhaustive = isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId);
      expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId), `seed=986 case=${i}`).toBe(exhaustive);
      if (sequenceFailsStableTargetCondition(r.state, costs, 0, r.db, source.instanceId)) {
        expect(exhaustive).toBe(false);
        rejected++;
      }
      if (exhaustive) payable++;
      expect(JSON.stringify(r.state)).toBe(before);
    }
    process.stderr.write(`OPT986 seed=986 sequences=6500 rejected=${rejected} payable=${payable}\n`);
    expect(rejected).toBeGreaterThan(1000);
    expect(payable).toBeGreaterThan(1000);
  }, 180_000);
});


describe("OPT-986 load-bearing guards", () => {
  function setup() {
    const r = rig();
    for (let i = 0; i < 3; i++) r.put(`guard-hand-${i}`, 0, "HAND");
    const source = r.put("guard-source", 0, "CHARACTER");
    const x = r.put("X", 0, "CHARACTER", { data: { name: "X", cost: 3 } });
    const prohibition: RuntimeProhibition = {
      id: "guard-hold", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "hold",
      prohibitionType: "CANNOT_BE_RESTED", scope: { cause: "ANY" },
      duration: { type: "PERMANENT" }, controller: 0, appliesTo: [x.instanceId], usesRemaining: null,
    };
    r.state.prohibitions.push(prohibition);
    return { r, source, x, prohibition };
  }

  function payable(r: Rig, source: CardInstance, costs: Cost[]) {
    const exhaustive = isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId);
    expect(exhaustive).toBe(true);
    expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(exhaustive);
  }

  it("C1 activeEffects guard: payment activates negation of the protection source", () => {
    const { r, source } = setup();
    const duration = { type: "WHILE_CONDITION" as const, condition: {
      type: "HAND_COUNT" as const, controller: "SELF" as const, operator: "<=" as const, value: 1,
    } };
    r.state.activeEffects.push({
      id: "conditional-negation", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "negation",
      category: "auto", modifiers: [{ type: "NEGATE_EFFECTS_FLAG", duration }], duration,
      expiresAt: { wave: "END_OF_TURN", turn: r.state.turn.number },
      controller: 0, appliesTo: [source.instanceId], timestamp: 0,
    });
    payable(r, source, [{ type: "TRASH_FROM_HAND", amount: 2 }, { type: "REST_CARDS", amount: 1, filter: { name: "X" } }]);
  });

  it("C2 conditionalOverride guard: payment enables the KO exception", () => {
    const { r, source, prohibition } = setup();
    prohibition.prohibitionType = "CANNOT_BE_KO";
    prohibition.conditionalOverride = { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 1 };
    payable(r, source, [{ type: "TRASH_FROM_HAND", amount: 2 }, { type: "KO_OWN_CHARACTER", amount: 1, filter: { name: "X" } }]);
  });

  it("C5 duration guard: payment ends a WHILE_CONDITION protection", () => {
    const { r, source, prohibition } = setup();
    prohibition.duration = { type: "WHILE_CONDITION", condition: { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 3 } };
    payable(r, source, [{ type: "PLACE_HAND_TO_DECK", amount: 1 }, { type: "REST_CARDS", amount: 1, filter: { name: "X" } }]);
  });

  it("C8 target guard: payment shrinks dynamic population coverage", () => {
    const { r, source, prohibition } = setup();
    prohibition.appliesTo = [];
    prohibition.target = { type: "ALL_YOUR_CHARACTERS", filter: { cost_max: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } } };
    payable(r, source, [{ type: "PLACE_HAND_TO_DECK", amount: 1 }, { type: "REST_CARDS", amount: 1, filter: { name: "X" } }]);
  });

  it("C9 scope.filter guard: payment shrinks dynamic scope coverage", () => {
    const { r, source, prohibition } = setup();
    prohibition.appliesTo = [];
    prohibition.scope.filter = { cost_max: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } };
    payable(r, source, [{ type: "PLACE_HAND_TO_DECK", amount: 1 }, { type: "REST_CARDS", amount: 1, filter: { name: "X" } }]);
  });

  it("C4 handCost guard: a field return supplies the named hand cost", () => {
    const { r, source } = setup();
    r.put("Z", 0, "CHARACTER", { data: { name: "Z" } });
    payable(r, source, [{ type: "RETURN_OWN_CHARACTER_TO_HAND", amount: 1, filter: { name: "Z" } },
      { type: "TRASH_FROM_HAND", amount: 1, filter: { name: "Z" } }]);
  });

  it.each([
    // ANY_NUMBER still requires a positive payment: no match cannot fully pay.
    { matches: 0, expected: false },
    // One active matching card fully pays a one-card choice.
    { matches: 1, expected: true },
    // Two active matches allow a fully payable one- or two-card choice.
    { matches: 2, expected: true },
  ])("ANY_NUMBER rest with $matches matching field cards is $expected", ({ matches, expected }) => {
    const r = rig();
    const source = r.put("amount-source", 0, "CHARACTER");
    r.put("prefix-card", 0, "HAND");
    for (let i = 0; i < matches; i++) r.put("amount-match", 0, "CHARACTER", { data: { name: "match" } });
    const costs: Cost[] = [
      { type: "PLACE_HAND_TO_DECK", amount: 1 },
      { type: "REST_CARDS", amount: "ANY_NUMBER", filter: { name: "match" } },
    ];
    const exhaustive = isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId);
    expect(exhaustive).toBe(expected);
    expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(exhaustive);
    expect(sequenceFailsStableTargetCondition(r.state, costs, 0, r.db, source.instanceId)).toBe(!expected);
  });

  const handAmountCases: { label: string; matches: number; suffix: Cost; expected: boolean }[] = [
    // The oracle defaults dynamic selection amounts to one; no match cannot fully pay.
    { label: "dynamic amount without a match", matches: 0, expected: false, suffix: {
      type: "TRASH_FROM_HAND", amount: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" }, filter: { name: "match" },
    } },
    // One match fully pays the oracle's one-card fallback, even with two cards left in hand.
    { label: "dynamic amount with one match", matches: 1, expected: true, suffix: {
      type: "TRASH_FROM_HAND", amount: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" }, filter: { name: "match" },
    } },
    // An omitted amount defaults to one; no matching card cannot fully pay it.
    { label: "omitted amount without a match", matches: 0, expected: false, suffix: {
      type: "TRASH_FROM_HAND", filter: { name: "match" },
    } },
    // One matching card fully pays the default one-card cost.
    { label: "omitted amount with one match", matches: 1, expected: true, suffix: {
      type: "TRASH_FROM_HAND", filter: { name: "match" },
    } },
    // Exactly two matching cards fully pay the numeric two-card cost.
    { label: "numeric amount exactly equals the candidate count", matches: 2, expected: true, suffix: {
      type: "TRASH_FROM_HAND", amount: 2, filter: { name: "match" },
    } },
  ];
  it.each(handAmountCases)("$label is $expected", ({ matches, suffix, expected }) => {
    const r = rig();
    const source = r.put("amount-source", 0, "CHARACTER");
    for (let i = 0; i < 2; i++) r.put("prefix-card", 0, "HAND");
    for (let i = 0; i < matches; i++) r.put("amount-match", 0, "HAND", { data: { name: "match" } });
    const costs: Cost[] = [{ type: "PLACE_HAND_TO_DECK", amount: 1, filter: { name: "prefix-card" } }, suffix];
    const exhaustive = isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId);
    expect(exhaustive).toBe(expected);
    expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(exhaustive);
    expect(sequenceFailsStableTargetCondition(r.state, costs, 0, r.db, source.instanceId)).toBe(!expected);
  });

  it("samples nonempty candidate pools smaller than the required amount", () => {
    const rand = prng(98601);
    for (let i = 0; i < 100; i++) {
      const { r, source } = setup();
      const matches = 1 + Math.floor(rand() * 3);
      for (let j = 0; j < matches; j++) r.put("match", 0, "HAND", { data: { name: "match" } });
      const suffix: Cost = { type: "TRASH_FROM_HAND", amount: matches + 1, filter: { name: "match" } };
      const costs: Cost[] = [{ type: "PLACE_HAND_TO_DECK", amount: 1 }, suffix];
      expect(computeCostTargets(r.state, suffix, 0, r.db, source.instanceId)).toHaveLength(matches);
      expect(sequenceFailsNecessaryCondition(r.state, costs, 0, source.instanceId)).toBe(false);
      expect(sequenceFailsStableTargetCondition(r.state, costs, 0, r.db, source.instanceId)).toBe(true);
      expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
      expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
    }
  }, 60_000);
});
