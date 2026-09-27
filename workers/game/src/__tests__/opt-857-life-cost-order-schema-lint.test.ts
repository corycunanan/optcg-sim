/**
 * OPT-857 — schema lint: a LIFE_TO_HAND cost stays last, because the replaced
 * Life-cost terminal path (ST13-003) never pays a later cost.
 */
import { describe, expect, it } from "vitest";
import type { Cost, EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import {
  findLifeCostOrderIntentViolations,
  findLifeCostOrderViolations,
} from "../engine/schema-life-cost-lint.js";

function schema(costs: Cost[], nested = false): EffectSchema {
  const block = {
    id: "paid",
    category: "activate" as const,
    trigger: { keyword: "ACTIVATE_MAIN" as const },
    costs,
    actions: [{ type: "DRAW" as const, params: { amount: 1 } }],
  };
  return {
    card_id: "SYN-857",
    card_name: "Synthetic",
    card_type: "Character",
    effects: nested
      ? [
          {
            id: "grant",
            category: "auto",
            trigger: { keyword: "ON_PLAY" },
            actions: [
              {
                type: "GRANT_EFFECT",
                target: { type: "SELF" },
                params: { effect: block },
              } as never,
            ],
          },
        ]
      : [block],
  };
}

const LIFE: Cost = { type: "LIFE_TO_HAND", amount: 1 };
const HAND: Cost = { type: "TRASH_FROM_HAND", amount: 1 };

describe("OPT-857 schema lint — LIFE_TO_HAND is the last cost", () => {
  it("passes the authored corpus", () => {
    expect(findLifeCostOrderIntentViolations(getAllAuthoredSchemas())).toEqual(
      []
    );
  });

  it("accepts a trailing Life cost", () => {
    expect(findLifeCostOrderViolations(schema([HAND, LIFE]))).toEqual([]);
  });

  it("flags a Life cost followed by another cost", () => {
    const [violation] = findLifeCostOrderViolations(schema([LIFE, HAND]));
    expect(violation).toContain("SYN-857 paid");
    expect(violation).toContain("LIFE_TO_HAND → TRASH_FROM_HAND");
  });

  it("flags a Life branch of CHOICE followed by a later cost", () => {
    expect(
      findLifeCostOrderViolations(
        schema([
          { type: "CHOICE", options: [[LIFE], [{ type: "REST_SELF" }]] },
          HAND,
        ])
      )
    ).toHaveLength(1);
    expect(
      findLifeCostOrderViolations(
        schema([{ type: "CHOICE", options: [[LIFE, HAND], [HAND]] }])
      )
    ).toHaveLength(1);
  });

  it("flags a Life option of CHOOSE_ONE_COST followed by a later cost", () => {
    expect(
      findLifeCostOrderViolations(
        schema([
          { type: "CHOOSE_ONE_COST", options: [LIFE, { type: "REST_SELF" }] },
          HAND,
        ])
      )
    ).toHaveLength(1);
    expect(
      findLifeCostOrderViolations(
        schema([
          HAND,
          { type: "CHOOSE_ONE_COST", options: [LIFE, { type: "REST_SELF" }] },
        ])
      )
    ).toEqual([]);
  });

  it("inspects nested (granted) blocks", () => {
    expect(findLifeCostOrderViolations(schema([LIFE, HAND], true))).toHaveLength(
      1
    );
  });
});
