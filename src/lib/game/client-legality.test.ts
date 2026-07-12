import { describe, expect, it } from "vitest";
import type { ActiveEffect, CardData } from "@shared/game-types";
import {
  canPlayCardInZone,
  getCardAffordability,
  isAttackTargetEligible,
} from "./client-legality";

const character = {
  type: "Character",
  cost: 5,
} as CardData;

describe("getCardAffordability", () => {
  it("uses effective cost and reports the exact DON shortfall", () => {
    const effects = [
      {
        appliesTo: ["hand-1"],
        modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
      },
    ] as unknown as ActiveEffect[];

    expect(getCardAffordability(character, "hand-1", effects, 2)).toEqual({
      effectiveCost: 3,
      missingDon: 1,
      affordable: false,
      reason: "Need 1 more DON",
    });
  });

  it("does not add a reason when the effective cost is affordable", () => {
    expect(getCardAffordability(character, "hand-1", [], 5)).toEqual({
      effectiveCost: 5,
      missingDon: 0,
      affordable: true,
      reason: undefined,
    });
  });
});

describe("canPlayCardInZone", () => {
  it("only accepts Characters in character slots", () => {
    expect(canPlayCardInZone("Character", "character")).toBe(true);
    expect(canPlayCardInZone("Stage", "character")).toBe(false);
    expect(canPlayCardInZone("Event", "character")).toBe(false);
  });

  it("only accepts Stages in the stage zone", () => {
    expect(canPlayCardInZone("Stage", "stage")).toBe(true);
    expect(canPlayCardInZone("Character", "stage")).toBe(false);
    expect(canPlayCardInZone("Event", "stage")).toBe(false);
  });
});

describe("isAttackTargetEligible", () => {
  it("accepts a leader regardless of orientation", () => {
    expect(isAttackTargetEligible("leader", "ACTIVE")).toBe(true);
    expect(isAttackTargetEligible("leader", "RESTED")).toBe(true);
  });

  it("accepts only RESTED characters", () => {
    expect(isAttackTargetEligible("character", "RESTED")).toBe(true);
    expect(isAttackTargetEligible("character", "ACTIVE")).toBe(false);
  });
});
