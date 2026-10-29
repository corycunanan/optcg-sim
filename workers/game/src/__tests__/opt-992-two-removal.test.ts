import { describe, expect, it } from "vitest";
import type { Cost, TargetFilter } from "../engine/effect-types.js";
import {
  isCostSequencePayable, isCostSequencePayableWithoutPrune, solveTwoRemovalCosts,
} from "../engine/effect-resolver/cost/feasibility.js";
import { rig } from "./opt-960-rig.js";

const families = [
  { zone: "HAND", types: ["TRASH_FROM_HAND", "PLACE_HAND_TO_DECK"] },
  { zone: "TRASH", types: ["PLACE_FROM_TRASH_TO_DECK"] },
  { zone: "CHARACTER", types: ["KO_OWN_CHARACTER", "TRASH_OWN_CHARACTER", "RETURN_OWN_CHARACTER_TO_HAND", "PLACE_OWN_CHARACTER_TO_DECK", "ADD_OWN_CHARACTER_TO_LIFE"] },
] as const;
const filters: TargetFilter[] = [
  { cost_max: -1 }, { cost_max: 2 }, { power_min: 2 }, { name: "match" },
  { cost_max: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } },
  { power_max: { type: "GAME_STATE", source: "DECK_COUNT", controller: "SELF" } },
  { cost_min: { type: "GAME_STATE", source: "LIFE_COUNT", controller: "OPPONENT" } },
  { power_min: { type: "GAME_STATE", source: "DON_FIELD_COUNT", controller: "SELF" } },
  { don_given_count: { operator: "==", value: 0 } },
  { don_given_count: { operator: ">=", value: { type: "GAME_STATE", source: "HAND_COUNT", controller: "SELF" } } },
  { exclude_self: true, cost_min: 1 },
];

describe("OPT-992 exact two-removal solver", () => {
  it("exhaustively compares dynamic filters across hand/trash/field families and modes", () => {
    let checked = 0, payable = 0, rejected = 0;
    const r = rig();
    r.deck(0, 1); r.life(0, 1); r.life(1, 2);
    const blank = structuredClone(r.state);
    for (const mode of [6, 7, 8] as const) for (const family of families) {
      for (const first of family.types) for (const second of family.types) {
        for (let k = 1; k <= 3; k++) for (const filter of filters) {
          r.state = structuredClone(blank);
          r.state.costSemanticsVersion = mode;
          const cards = Array.from({ length: 4 }, (_, index) => r.put(`test-${index}`, 0, family.zone, {
            data: { cost: index, power: index, name: index % 2 ? "match" : "other" },
            state: index % 2 ? "RESTED" : "ACTIVE",
          }));
          // Alternate restricted and unrestricted prefix pools: overlap matters.
          const costs: Cost[] = [
            { type: first, amount: k, ...(k === 2 ? { filter: { name: "match" } } : {}) },
            { type: second, amount: 2, filter },
          ];
          const source = cards[0].instanceId;
          const before = JSON.stringify(r.state);
          const oracle = isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source);
          const solved = solveTwoRemovalCosts(r.state, costs, 0, r.db, source);
          expect(solved, JSON.stringify({ mode, costs, family })).toBe(oracle);
          expect(isCostSequencePayable(r.state, costs, 0, r.db, source)).toBe(oracle);
          expect(JSON.stringify(r.state)).toBe(before);
          checked++; if (oracle) payable++; else rejected++;
        }
      }
    }
    process.stderr.write(`OPT992 comparisons=${checked} payable=${payable} rejected=${rejected}\n`);
    expect(payable).toBeGreaterThan(100); expect(rejected).toBeGreaterThan(100);
  }, 60_000);

  it("preserves scarce suffix matches instead of using the representative as a witness", () => {
    const r = rig();
    const source = r.put("match", 0, "HAND");
    r.put("other", 0, "HAND"); r.put("other", 0, "HAND");
    const costs: Cost[] = [{ type: "TRASH_FROM_HAND", amount: 2 }, { type: "TRASH_FROM_HAND", amount: 1, filter: { name: "match" } }];
    expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, source.instanceId)).toBe(true);
    costs[0] = { type: "TRASH_FROM_HAND", amount: 2, filter: { name: "match" } };
    expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
  });

  it("accounts for forced overlap even when each individual pool is large enough", () => {
    const r = rig();
    const source = r.put("match", 0, "HAND");
    r.put("match", 0, "HAND"); r.put("other", 0, "HAND"); r.put("other", 0, "HAND");
    const costs: Cost[] = [{ type: "TRASH_FROM_HAND", amount: 2, filter: { name: "match" } }, { type: "TRASH_FROM_HAND", amount: 1, filter: { name: "match" } }];
    expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
    expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
  });

  it.each(["attachments", "hand schema", "prohibition", "active effect", "identity count", "longer sequence"])("falls back for %s", reason => {
    const r = rig();
    const source = r.put("a", 0, "HAND"); r.put("b", 0, "HAND"); r.put("c", 0, "HAND");
    const costs: Cost[] = [{ type: "TRASH_FROM_HAND", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1, filter: { cost_max: 100 } }];
    if (reason === "attachments") source.attachedDon.push({ ...r.state.players[0].donCostArea.pop()!, attachedTo: source.instanceId });
    if (reason === "hand schema") r.db.get("a")!.effectSchema = { card_id: "a", card_name: "a", card_type: "Character", effects: [] };
    if (reason === "prohibition") r.state.prohibitions.push({ id: "p", controller: 0, sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "p", prohibitionType: "CANNOT_BE_RESTED", scope: { cause: "ANY" }, duration: { type: "PERMANENT" }, appliesTo: [], usesRemaining: null });
    if (reason === "active effect") r.state.activeEffects.push({ id: "e", controller: 0, sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "e", category: "auto", modifiers: [], expiresAt: { wave: "END_OF_TURN", turn: 1 }, duration: { type: "PERMANENT" }, appliesTo: [], timestamp: 0 });
    if (reason === "identity count") costs[1] = { type: "TRASH_FROM_HAND", amount: 1, filter: { cost_max: { type: "GAME_STATE", source: "MATCHING_CARD_COUNT" } } };
    if (reason === "longer sequence") costs.push({ type: "REST_DON", amount: 1 });
    expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, source.instanceId)).toBeUndefined();
    expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId));
  });
});

it("OPT-992 attached DON makes the choice-dependent threshold require fallback", () => {
  const r = rig();
  const x = r.put("cost-nine", 0, "CHARACTER", { data: { cost: 9 } });
  const donor = r.put("donor", 0, "CHARACTER", { data: { cost: 10 } });
  // A legal attached ninth DON, distinct from the eight cost-area identities.
  donor.attachedDon.push({ instanceId: "attached-ninth", state: "RESTED", attachedTo: donor.instanceId });
  const costs: Cost[] = [{ type: "TRASH_OWN_CHARACTER", amount: 1 }, { type: "TRASH_OWN_CHARACTER", amount: 1, filter: { cost_max: { type: "GAME_STATE", source: "DON_FIELD_COUNT", controller: "SELF" } } }];
  expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, x.instanceId)).toBeUndefined();
  expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, x.instanceId)).toBe(true);
  expect(isCostSequencePayable(r.state, costs, 0, r.db, x.instanceId)).toBe(true);
});

it("OPT-992 field rested-count reads vary with the removed identity", () => {
  const r = rig();
  const x = r.put("rested", 0, "CHARACTER", { data: { cost: 1 }, state: "RESTED" });
  r.put("active", 0, "CHARACTER", { data: { cost: 9 } });
  const costs: Cost[] = [{ type: "TRASH_OWN_CHARACTER", amount: 1 }, { type: "TRASH_OWN_CHARACTER", amount: 1, filter: { cost_max: { type: "GAME_STATE", source: "RESTED_CARD_COUNT" } } }];
  expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, x.instanceId)).toBeUndefined();
  expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, x.instanceId)).toBe(true);
  expect(isCostSequencePayable(r.state, costs, 0, r.db, x.instanceId)).toBe(true);
});

it("OPT-992 source removal can end a suffix cost modifier", () => {
  const r = rig();
  const source = r.put("modifier-source", 0, "CHARACTER", { data: { cost: 10, name: "prefix" } });
  r.put("other-prefix", 0, "CHARACTER", { data: { cost: 10, name: "prefix" } });
  const target = r.put("target", 0, "CHARACTER", { data: { cost: 5 } });
  r.state.activeEffects.push({
    id: "cost-reducer", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "reduce",
    category: "permanent", controller: 0, appliesTo: [target.instanceId], timestamp: 0,
    duration: { type: "PERMANENT" }, expiresAt: { wave: "END_OF_TURN", turn: 3 },
    modifiers: [{ type: "MODIFY_COST", params: { amount: -5 }, duration: { type: "PERMANENT" } }],
  });
  const costs: Cost[] = [{ type: "TRASH_OWN_CHARACTER", amount: 1, filter: { name: "prefix" } }, { type: "TRASH_OWN_CHARACTER", amount: 1, filter: { cost_max: 0 } }];
  expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId)).toBe(true);
  expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(true);
  expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, source.instanceId)).toBeUndefined();
});

it("OPT-992 field suffix still honors the cost movement prohibition", () => {
  const r = rig();
  const source = r.put("prefix", 0, "CHARACTER");
  const target = r.put("target", 0, "CHARACTER");
  r.state.prohibitions.push({
    id: "hold", sourceCardInstanceId: r.state.players[0].leader.instanceId, sourceEffectBlockId: "hold",
    controller: 0, appliesTo: [target.instanceId], usesRemaining: null,
    prohibitionType: "CANNOT_BE_KO", scope: { cause: "ANY" }, duration: { type: "PERMANENT" },
  });
  const costs: Cost[] = [{ type: "TRASH_OWN_CHARACTER", amount: 1, filter: { name: "prefix" } }, { type: "KO_OWN_CHARACTER", amount: 1, filter: { name: "target" } }];
  expect(isCostSequencePayableWithoutPrune(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
  expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(false);
  expect(solveTwoRemovalCosts(r.state, costs, 0, r.db, source.instanceId)).toBeUndefined();
});
