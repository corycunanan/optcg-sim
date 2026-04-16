/**
 * OPT-176 — CHOICE cost type/validation tests.
 *
 * Pure validation — no runtime behavior.
 */

import { describe, it, expect } from "vitest";
import type { Cost, EffectSchema } from "../engine/effect-types.js";
import { validateCost, validateEffectSchema } from "../engine/schema-registry.js";

function schemaWithCosts(costs: Cost[]): EffectSchema {
  return {
    effects: [
      {
        id: "e1",
        category: "activate",
        trigger: { keyword: "ON_PLAY" },
        costs,
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  } as EffectSchema;
}

describe("OPT-176 CHOICE cost validation", () => {
  it("accepts a well-formed CHOICE cost", () => {
    const cost: Cost = {
      type: "CHOICE",
      options: [
        [{ type: "DON_MINUS", amount: 2 }],
        [{ type: "TRASH_FROM_HAND", amount: 1 }],
      ],
      labels: ["Pay 2 DON", "Trash 1 card"],
    };
    expect(validateCost(cost, "root", false)).toEqual([]);
    expect(validateEffectSchema(schemaWithCosts([cost]))).toEqual([]);
  });

  it("accepts CHOICE without labels", () => {
    const cost: Cost = {
      type: "CHOICE",
      options: [
        [{ type: "DON_MINUS", amount: 1 }],
        [{ type: "DON_MINUS", amount: 2 }],
      ],
    };
    expect(validateCost(cost, "root", false)).toEqual([]);
  });

  it("rejects CHOICE with fewer than 2 branches", () => {
    const cost = {
      type: "CHOICE",
      options: [[{ type: "DON_MINUS", amount: 1 }]],
    } as unknown as Cost;
    const errors = validateCost(cost, "root", false);
    expect(errors.some((e) => e.includes("at least 2 branches"))).toBe(true);
  });

  it("rejects a non-array branch", () => {
    const cost = {
      type: "CHOICE",
      options: [
        [{ type: "DON_MINUS", amount: 1 }],
        { type: "DON_MINUS", amount: 2 },
      ],
    } as unknown as Cost;
    const errors = validateCost(cost, "root", false);
    expect(errors.some((e) => e.includes("options[1]"))).toBe(true);
  });

  it("rejects nested CHOICE inside CHOICE", () => {
    const inner: Cost = {
      type: "CHOICE",
      options: [
        [{ type: "DON_MINUS", amount: 1 }],
        [{ type: "DON_MINUS", amount: 2 }],
      ],
    };
    const outer: Cost = {
      type: "CHOICE",
      options: [[{ type: "DON_MINUS", amount: 1 }], [inner]],
    };
    const errors = validateCost(outer, "root", false);
    expect(errors.some((e) => e.includes("cannot nest"))).toBe(true);
  });

  it("rejects labels length mismatch", () => {
    const cost: Cost = {
      type: "CHOICE",
      options: [
        [{ type: "DON_MINUS", amount: 1 }],
        [{ type: "DON_MINUS", amount: 2 }],
      ],
      labels: ["only one"],
    };
    const errors = validateCost(cost, "root", false);
    expect(errors.some((e) => e.includes("'labels' length"))).toBe(true);
  });

  it("rejects non-string labels", () => {
    const cost = {
      type: "CHOICE",
      options: [
        [{ type: "DON_MINUS", amount: 1 }],
        [{ type: "DON_MINUS", amount: 2 }],
      ],
      labels: ["ok", 42],
    } as unknown as Cost;
    const errors = validateCost(cost, "root", false);
    expect(errors.some((e) => e.includes("array of strings"))).toBe(true);
  });

  it("existing non-CHOICE costs still validate clean", () => {
    const cost: Cost = { type: "DON_MINUS", amount: 2 };
    expect(validateCost(cost, "root", false)).toEqual([]);
  });
});
