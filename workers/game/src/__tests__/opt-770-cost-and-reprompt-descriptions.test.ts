import { describe, expect, it } from "vitest";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

const CLAUSE = "[Activate: Main] K.O. up to 1 of your opponent's Characters.";
const FULL = `${CLAUSE}\n[Trigger] Draw 1 card.`;
const KO: Action = {
  type: "KO",
  target: {
    type: "CHARACTER",
    controller: "OPPONENT",
    count: { up_to: 1 },
  },
};

function setup() {
  const cardDb = createTestCardDb();
  cardDb.set(CARDS.LEADER.id, {
    ...CARDS.LEADER,
    effectText: FULL,
  });
  const state = createBattleReadyState(cardDb);
  return {
    cardDb,
    state,
    sourceId: state.players[0].leader.instanceId,
  };
}

function block(actions: Action[], costs?: EffectBlock["costs"]): EffectBlock {
  return {
    id: "opt-770-description",
    category: "activate",
    trigger: { keyword: "ACTIVATE_MAIN" },
    costs,
    actions,
  };
}

describe("OPT-770 cost and rejected-response descriptions", () => {
  it("carries the clause through a selectable non-optional cost", () => {
    const { cardDb, state, sourceId } = setup();
    const costPrompt = resolveEffect(
      state,
      block([KO], [{ type: "TRASH_FROM_HAND", amount: 1 }]),
      sourceId,
      0,
      cardDb
    );
    expect(costPrompt.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const handCardId = costPrompt.state.players[0].hand[0]!.instanceId;
    const koPrompt = resumeFromStack(
      costPrompt.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [handCardId] },
      cardDb
    );

    expect(koPrompt.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      effectDescription: CLAUSE,
    });
  });

  it("keeps the clause on invalid-target and aggregate-constraint re-prompts", () => {
    const ordinary = setup();
    const ordinaryPrompt = resolveEffect(
      ordinary.state,
      block([KO]),
      ordinary.sourceId,
      0,
      ordinary.cardDb
    );
    expect(ordinaryPrompt.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      effectDescription: CLAUSE,
    });

    const invalidTarget = resumeFromStack(
      ordinaryPrompt.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["not-a-valid-target"] },
      ordinary.cardDb
    );
    expect(invalidTarget.rejected).toBe(true);
    expect(invalidTarget.pendingPrompt?.options).toMatchObject({
      effectDescription: CLAUSE,
    });

    const aggregate = setup();
    const aggregateAction: Action = {
      ...KO,
      target: {
        ...KO.target,
        count: { up_to: 2 },
        aggregate_constraint: {
          property: "power",
          operator: "<=",
          value: 4000,
        },
      },
    };
    const aggregatePrompt = resolveEffect(
      aggregate.state,
      block([aggregateAction]),
      aggregate.sourceId,
      0,
      aggregate.cardDb
    );
    const aggregateTargets =
      aggregatePrompt.pendingPrompt?.options.promptType === "SELECT_TARGET"
        ? aggregatePrompt.pendingPrompt.options.validTargets
        : [];
    expect(aggregateTargets).toHaveLength(2);

    const invalidAggregate = resumeFromStack(
      aggregatePrompt.state,
      { type: "SELECT_TARGET", selectedInstanceIds: aggregateTargets },
      aggregate.cardDb
    );
    expect(invalidAggregate.rejected).toBe(true);
    expect(invalidAggregate.pendingPrompt?.options).toMatchObject({
      effectDescription: CLAUSE,
    });
  });

  it("keeps the clause on an invalid simultaneous-group re-prompt", () => {
    const { cardDb, state, sourceId } = setup();
    const simultaneous: Action[] = [
      {
        type: "MODIFY_POWER",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { exact: 1 },
        },
        params: { amount: 1000 },
        duration: { type: "THIS_TURN" },
      },
      {
        type: "MODIFY_COST",
        target: { type: "YOUR_LEADER" },
        params: { amount: -1 },
        duration: { type: "THIS_TURN" },
        chain: "AND",
      },
    ];
    const initial = resolveEffect(
      state,
      block(simultaneous),
      sourceId,
      0,
      cardDb
    );
    expect(initial.pendingPrompt?.options).toMatchObject({
      promptType: "SELECT_TARGET",
      effectDescription: CLAUSE,
    });

    const rejected = resumeFromStack(
      initial.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [] },
      cardDb
    );
    expect(rejected.rejected).toBe(true);
    expect(rejected.pendingPrompt?.options).toMatchObject({
      effectDescription: CLAUSE,
    });
  });
});
