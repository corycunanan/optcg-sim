import { describe, expect, it } from "vitest";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import type { Action } from "../engine/effect-types.js";
import { buildSelectTargetPrompt } from "../engine/effect-resolver/target-resolver.js";
import {
  collectTargetInstructionCoverage,
  generateTargetInstruction,
} from "../engine/effect-resolver/target-instruction.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

describe("OPT-775 target instructions", () => {
  it("composes the ratified grammar from left to right", () => {
    expect(
      generateTargetInstruction(
        { type: "KO" },
        {
          type: "CHARACTER",
          controller: "OPPONENT",
          filter: { cost_max: 8 },
        },
        0,
        2
      )
    ).toBe(
      "KO up to 2 of your opponent's Characters with a cost of 8 or less."
    );

    expect(
      generateTargetInstruction(
        { type: "MODIFY_POWER", params: { amount: -2000 } },
        {
          type: "LEADER_OR_CHARACTER",
          controller: "SELF",
          filter: {
            power_min: 5000,
            color: "RED",
            traits: ["Straw Hat Crew"],
            name: "Nami",
            keywords: ["BLOCKER"],
            is_rested: true,
          },
          aggregate_constraint: {
            property: "cost",
            operator: "<=",
            value: 8,
          },
          uniqueness_constraint: { field: "name" },
        },
        1,
        3
      )
    ).toBe(
      "Give −2000 power to 1 to 3 of your Leaders or Characters with a power of 5000 or more that are red with the {Straw Hat Crew} type named [Nami] with [Blocker] that are rested with a total cost of 8 or less with different names."
    );
  });

  it("falls back for advanced targets and uncovered filter fields", () => {
    expect(
      generateTargetInstruction(
        { type: "KO" },
        {
          type: "CHARACTER",
          controller: "OPPONENT",
          dual_targets: [{ filter: { cost_max: 3 }, count: { exact: 1 } }],
        },
        1,
        1
      )
    ).toBeUndefined();
    expect(
      generateTargetInstruction(
        { type: "KO" },
        {
          type: "CHARACTER",
          controller: "OPPONENT",
          filter: { exclude_self: true },
        },
        1,
        1
      )
    ).toBeUndefined();
  });

  it("preserves validTargets whether instruction generation succeeds or falls back", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const sourceId = state.players[0].leader.instanceId;
    const validTargets = state.players[1].characters
      .filter((card) => card !== null)
      .map((card) => card.instanceId);
    const resultRefs = new Map();
    const action: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { up_to: 1 },
      },
    };
    const fallbackAction: Action = {
      ...action,
      target: { ...action.target!, filter: { exclude_self: true } },
    };

    const generated = buildSelectTargetPrompt(
      state,
      action,
      validTargets,
      sourceId,
      0,
      cardDb,
      resultRefs
    );
    const fallback = buildSelectTargetPrompt(
      state,
      fallbackAction,
      validTargets,
      sourceId,
      0,
      cardDb,
      resultRefs
    );

    expect(generated.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      validTargets,
      instruction: "KO up to 1 of your opponent's Characters.",
    });
    expect(fallback.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      validTargets,
    });
    expect(fallback.pendingPrompt?.options).not.toHaveProperty("instruction");
  });

  it("snapshots every authored action target and the distinct wording set", () => {
    const coverage = collectTargetInstructionCoverage(getAllAuthoredSchemas());

    expect(coverage.targetCount).toBeGreaterThan(0);
    expect(coverage.generatedCount + coverage.fallbacks.length).toBe(
      coverage.targetCount
    );
    expect({
      targetCount: coverage.targetCount,
      generatedCount: coverage.generatedCount,
      fallbackCount: coverage.fallbacks.length,
      instructions: coverage.instructions,
      fallbacks: coverage.fallbacks,
    }).toMatchSnapshot();
  });
});
