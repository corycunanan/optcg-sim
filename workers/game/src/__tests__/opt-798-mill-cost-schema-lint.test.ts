/**
 * OPT-798 — schema lint: canonical "You may trash N cards from the top of
 * your deck:" (pre-colon, rule 8-3-1) must be encoded as a MILL cost, never
 * as a first MILL action or as another cost type.
 */
import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import {
  findMillCostIntentViolations,
  findMillCostViolations,
  preColonMillAmounts,
  preColonMillClauses,
} from "../engine/schema-cost-lint.js";

// ─── Schema lint ─────────────────────────────────────────────────────────────

describe("OPT-798 schema lint — pre-colon deck trash must be a MILL cost", () => {
  const text = "[Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.";
  const actionFirst: EffectSchema = {
    card_id: "SYN-001",
    card_name: "Synthetic",
    card_type: "Event",
    effects: [{
      id: "main",
      category: "activate",
      trigger: { keyword: "MAIN_EVENT" },
      flags: { optional: true },
      actions: [
        { type: "MILL", params: { amount: 2 } },
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 }, filter: { cost_max: 5 } } },
      ],
    }],
  };

  it("flags a MILL-first action encoding of a pre-colon deck-trash cost", () => {
    const violations = findMillCostViolations(text, actionFirst);
    expect(violations.some((v) => v.includes("SYN-001") && v.includes("first action"))).toBe(true);
  });

  it("flags a pre-colon deck-trash cost encoded as some other cost", () => {
    const wrongCost: EffectSchema = {
      ...actionFirst,
      effects: [{ ...actionFirst.effects[0], costs: [{ type: "TRASH_FROM_HAND", amount: 2 }], actions: actionFirst.effects[0].actions!.slice(1) }],
    };
    expect(findMillCostViolations(text, wrongCost).some((v) => v.includes("MILL cost"))).toBe(true);
  });

  it("flags a MILL cost whose card text has no pre-colon deck trash", () => {
    const stray: EffectSchema = {
      ...actionFirst,
      effects: [{ ...actionFirst.effects[0], costs: [{ type: "MILL", amount: 2 }], actions: actionFirst.effects[0].actions!.slice(1) }],
    };
    expect(findMillCostViolations("[Main] Trash 2 cards from the top of your deck. Then, K.O. up to 1.", stray)).not.toHaveLength(0);
  });

  it("accepts the MILL cost encoding", () => {
    const good: EffectSchema = {
      ...actionFirst,
      effects: [{ ...actionFirst.effects[0], costs: [{ type: "MILL", amount: 2 }], actions: actionFirst.effects[0].actions!.slice(1) }],
    };
    expect(findMillCostViolations(text, good)).toEqual([]);
  });

  it("does not flag a post-colon or standalone mill action", () => {
    const standalone: EffectSchema = {
      card_id: "SYN-002",
      card_type: "Character",
      effects: [{ id: "op", category: "auto", trigger: { keyword: "ON_PLAY" }, actions: [{ type: "MILL", params: { amount: 2 } }] }],
    };
    expect(findMillCostViolations("[On Play] Trash 2 cards from the top of your deck.", standalone)).toEqual([]);
  });

  it("reads pre-colon amounts past keyword-bracket colons and ignores post-colon mills", () => {
    expect(preColonMillAmounts("[Activate: Main] [Once Per Turn] You may trash 1 card from the top of your deck: Draw 1 card.")).toEqual([1]);
    expect(preColonMillAmounts("[On Play] Draw 1 card. Then, trash 2 cards from the top of your deck.")).toEqual([]);
    expect(preColonMillAmounts("[On Play] Draw 1 card.<br>[When Attacking] You may trash 3 cards from the top of your deck: K.O. up to 1.")).toEqual([3]);
  });

  it("deferrals suppress a still-violating card and report a stale one", () => {
    const good: EffectSchema = {
      ...actionFirst,
      card_id: "SYN-003",
      effects: [{ ...actionFirst.effects[0], costs: [{ type: "MILL", amount: 2 }], actions: actionFirst.effects[0].actions!.slice(1) }],
    };
    const cards = [{ cardId: "SYN-001", text }, { cardId: "SYN-003", text }];
    const schemas = { "SYN-001": actionFirst, "SYN-003": good };
    expect(findMillCostIntentViolations(cards, schemas, new Set())).not.toHaveLength(0);
    expect(findMillCostIntentViolations(cards, schemas, new Set(["SYN-001"]))).toEqual([]);
    expect(findMillCostIntentViolations(cards, schemas, new Set(["SYN-001", "SYN-003"]))).toEqual([
      expect.stringContaining("SYN-003: listed in MILL_COST_ENCODING_DEFERRALS but no longer violates"),
    ]);
  });

  // Codex review (OPT-798 round 1): printed clauses are matched per block
  // timing, not pooled across the card.
  const twoTimings = "[Main] You may trash 2 cards from the top of your deck: Draw 1 card.\n[When Attacking] Trash 2 cards from the top of your deck.";
  const draw = { type: "DRAW", params: { amount: 1 } } as const;

  it("accepts a correct Main MILL cost beside a separate When Attacking mill action", () => {
    const schema: EffectSchema = {
      card_id: "SYN-010",
      card_type: "Character",
      effects: [
        { id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, flags: { optional: true }, costs: [{ type: "MILL", amount: 2 }], actions: [draw] },
        { id: "attack", category: "auto", trigger: { keyword: "WHEN_ATTACKING" }, actions: [{ type: "MILL", params: { amount: 2 } }] },
      ],
    };
    expect(findMillCostViolations(twoTimings, schema)).toEqual([]);
  });

  it("rejects a MILL cost placed on the wrong block's timing", () => {
    const schema: EffectSchema = {
      card_id: "SYN-011",
      card_type: "Character",
      effects: [
        { id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, flags: { optional: true }, actions: [draw] },
        { id: "attack", category: "auto", trigger: { keyword: "WHEN_ATTACKING" }, costs: [{ type: "MILL", amount: 2 }], actions: [draw] },
      ],
    };
    const violations = findMillCostViolations("[Main] You may trash 2 cards from the top of your deck: Draw 1 card.\n[When Attacking] Draw 1 card.", schema);
    expect(violations).toEqual(expect.arrayContaining([
      expect.stringContaining("SYN-011: printed \"trash 2 cards from the top of your deck:\" requires a MILL cost with amount 2 on its MAIN_EVENT block"),
      expect.stringContaining("SYN-011 attack: MILL cost (amount 2) has no printed"),
    ]));
  });

  it("attributes a timed clause through prefix brackets such as [DON!! x1] and [Once Per Turn]", () => {
    expect(preColonMillClauses("[DON!! x1] [When Attacking] [Once Per Turn] You may trash 1 card from the top of your deck: Draw 1 card.")).toEqual([
      { amount: 1, keywords: ["WHEN_ATTACKING"] },
    ]);
  });

  it("falls back to card-wide matching when the line has no timing bracket", () => {
    expect(preColonMillClauses("When your Character is K.O.'d, you may trash 1 card from the top of your deck: Draw 1 card.")).toEqual([
      { amount: 1, keywords: null },
    ]);
    const schema: EffectSchema = {
      card_id: "SYN-012",
      card_type: "Character",
      effects: [{ id: "watch", category: "auto", trigger: { event: "ANY_CHARACTER_KO" } as never, flags: { optional: true }, costs: [{ type: "MILL", amount: 1 }], actions: [draw] }],
    };
    expect(findMillCostViolations("When your Character is K.O.'d, you may trash 1 card from the top of your deck: Draw 1 card.", schema)).toEqual([]);
  });
});
