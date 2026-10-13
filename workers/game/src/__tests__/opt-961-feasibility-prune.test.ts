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
import type { Cost } from "../engine/effect-types.js";
import {
  isCostSequencePayable,
  isCostSequencePayableWithoutPrune,
  sequenceFailsNecessaryCondition,
} from "../engine/effect-resolver/cost/feasibility.js";
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
