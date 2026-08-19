import { describe, expect, it } from "vitest";
import type { EffectSchema, Target } from "../engine/effect-types.js";
import { validateEffectSchema } from "../engine/schema-registry.js";

function buildSchema(
  type: Target["type"],
  count?: Target["count"]
): EffectSchema {
  return {
    card_id: "TEST-699",
    card_name: "Implicit All Count",
    card_type: "Character",
    effects: [
      {
        id: "implicit-all-count",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "RETURN_TO_HAND",
            target: { type, count },
          },
        ],
      },
    ],
  } as EffectSchema;
}

function buildCostSchema(count?: Target["count"]): EffectSchema {
  return {
    card_id: "TEST-699-COST",
    card_name: "Implicit All Cost Count",
    card_type: "Character",
    effects: [
      {
        id: "implicit-all-cost-count",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        costs: [
          {
            type: "REST_CARDS",
            target: { type: "ALL_YOUR_CHARACTERS", count },
          },
        ],
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  } as EffectSchema;
}

describe("OPT-699 ALL_* implicit-all schema lint", () => {
  it("rejects ALL_YOUR_CHARACTERS with an up_to count", () => {
    expect(
      validateEffectSchema(
        buildSchema("ALL_YOUR_CHARACTERS", { up_to: 2 }),
        "TEST-699"
      )
    ).toContainEqual(expect.stringContaining("[C9]"));
  });

  it("rejects ALL_OPPONENT_CHARACTERS with an exact count", () => {
    expect(
      validateEffectSchema(
        buildSchema("ALL_OPPONENT_CHARACTERS", { exact: 1 }),
        "TEST-699"
      )
    ).toContainEqual(expect.stringContaining("[C9]"));
  });

  it("rejects ALL_YOUR_CHARACTERS with an any_number count", () => {
    expect(
      validateEffectSchema(
        buildSchema("ALL_YOUR_CHARACTERS", { any_number: true }),
        "TEST-699"
      )
    ).toContainEqual(expect.stringContaining("[C9]"));
  });

  it("rejects ALL_YOUR_CHARACTERS with an all-false count", () => {
    expect(
      validateEffectSchema(
        buildSchema(
          "ALL_YOUR_CHARACTERS",
          { all: false } as unknown as Target["count"]
        ),
        "TEST-699"
      )
    ).toContainEqual(expect.stringContaining("[C9]"));
  });

  it("rejects an ALL_YOUR_CHARACTERS cost target with an exact count", () => {
    expect(
      validateEffectSchema(buildCostSchema({ exact: 1 }), "TEST-699-COST")
    ).toContainEqual(expect.stringContaining("[C9]"));
  });

  it("rejects a non-all dual-target slot count on an ALL_* parent", () => {
    const schema = buildSchema("ALL_YOUR_CHARACTERS");
    schema.effects[0].actions![0].target!.dual_targets = [
      { filter: {}, count: { exact: 1 } },
    ];

    expect(validateEffectSchema(schema, "TEST-699")).toContainEqual(
      expect.stringContaining(".dual_targets[0].count: [C9]")
    );
  });

  it("accepts ALL_YOUR_CHARACTERS with an all count", () => {
    expect(
      validateEffectSchema(
        buildSchema("ALL_YOUR_CHARACTERS", { all: true }),
        "TEST-699"
      )
    ).toEqual([]);
  });

  it("accepts ALL_YOUR_CHARACTERS with no count", () => {
    expect(
      validateEffectSchema(buildSchema("ALL_YOUR_CHARACTERS"), "TEST-699")
    ).toEqual([]);
  });

  it("accepts an ALL_YOUR_CHARACTERS cost target with no count", () => {
    expect(validateEffectSchema(buildCostSchema(), "TEST-699-COST")).toEqual(
      []
    );
  });
});
