import { describe, expect, it } from "vitest";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import type { Action, EffectBlock, Target } from "../engine/effect-types.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
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

  it.each([
    {
      per_type_selection: {
        types: ["CHARACTER"],
        count_per_type: { exact: 1 },
      },
    },
    {
      mixed_pool: {
        types: ["CHARACTER", "DON_IN_COST_AREA"],
        total_count: { up_to: 1 },
      },
    },
    { named_distribution: { names: ["Nami"] } },
    { self_ref: true },
    { ref: "selected" },
    { filter: { is_rested: false } },
    { filter: { is_active: false } },
    { filter: { is_rested: true, is_active: true } },
    { filter: { color: "RED", color_includes: ["BLUE"] } },
  ] satisfies Partial<Target>[])(
    "keeps unsupported constraints in the printed fallback: %j",
    (unsupported) => {
      expect(
        generateTargetInstruction(
          { type: "KO" },
          {
            type: "CHARACTER",
            ...unsupported,
          },
          0,
          1
        )
      ).toBeUndefined();
    }
  );

  it("retains the optional count for a Stage", () => {
    expect(
      generateTargetInstruction(
        { type: "KO" },
        {
          type: "STAGE",
          controller: "OPPONENT",
        },
        0,
        1
      )
    ).toBe("KO up to 1 of your opponent's Stage.");
  });

  it("inventories action and non-action target blocks", () => {
    const coverage = collectTargetInstructionCoverage({
      TEST: {
        card_id: "TEST",
        effects: [
          {
            id: "coverage",
            category: "auto",
            trigger: { keyword: "ON_PLAY" },
            costs: [{ type: "REST_CARDS", target: { type: "CHARACTER" } }],
            actions: [{ type: "KO", target: { type: "CHARACTER" } }],
          },
        ],
      },
    });
    expect(coverage.targetCount).toBe(2);
    expect(coverage.generatedCount).toBe(1);
    expect(coverage.fallbacks).toEqual([
      "TEST.effects.0.costs.0.target (non-action target)",
    ]);
  });

  it("renders OP08-043's conditional override action in golden coverage", () => {
    const schema = getAllAuthoredSchemas()["OP08-043"];
    const coverage = collectTargetInstructionCoverage({ "OP08-043": schema });
    expect(coverage.targetCount).toBe(2);
    expect(coverage.generatedCount).toBe(2);
    expect(coverage.fallbacks).toEqual([]);
    expect(coverage.instructions).toContain(
      "Trash 2 of your opponent's cards in hand."
    );
  });

  it.each([
    ["TOP", "top"],
    ["BOTTOM", "bottom"],
    [undefined, "bottom"],
  ] as const)(
    "describes RETURN_TO_DECK %s at the resolver prompt boundary",
    (position, label) => {
      const cardDb = createTestCardDb();
      const state = createBattleReadyState(cardDb);
      const block: EffectBlock = {
        id: "return-position",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [
          {
            type: "RETURN_TO_DECK",
            params: { position },
            target: {
              type: "CHARACTER",
              controller: "OPPONENT",
              count: { up_to: 1 },
            },
          },
        ],
      };
      const result = resolveEffect(state, block, "char-0-v1", 0, cardDb);
      expect(result.pendingPrompt?.options).toMatchObject({
        promptType: "SELECT_TARGET",
        instruction: `Return to the ${label} of the deck up to 1 of your opponent's Characters.`,
        validTargets: ["char-1-v1", "char-1-b1"],
      });
    }
  );

  it("resolves the same legal pool with generated and fallback instructions", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    state.players[1].characters[1]!.state = "RESTED";
    const before = structuredClone(state);
    const action: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { up_to: 1 },
        filter: { is_rested: true },
      },
    };
    const resolve = (candidate: Action) =>
      resolveEffect(
        state,
        {
          id: "invariance",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [candidate],
        },
        "char-0-v1",
        0,
        cardDb
      );
    const generated = resolve(action);
    // Source belongs to player 0, so exclude_self cannot change the opponent pool.
    const fallback = resolve({
      ...action,
      target: {
        ...action.target!,
        filter: { is_rested: true, exclude_self: true },
      },
    });
    for (const result of [generated, fallback]) {
      expect(result.pendingPrompt?.options).toMatchObject({
        promptType: "SELECT_TARGET",
        validTargets: ["char-1-b1"],
        countMin: 0,
        countMax: 1,
      });
      expect(
        result.state.effectStack.find(
          (frame) => frame.id === result.pendingPrompt?.resumeContext
        )
      ).toMatchObject({
        validTargets: ["char-1-b1"],
      });
    }
    expect(generated.pendingPrompt?.options).toHaveProperty(
      "instruction",
      "KO up to 1 of your opponent's Characters that are rested."
    );
    expect(fallback.pendingPrompt?.options).not.toHaveProperty("instruction");
    expect(state).toEqual(before);
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
