import { describe, expect, it } from "vitest";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import type { EffectStackFrame, GameState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const effectBlock: EffectBlock = {
  id: "opt-439-effect",
  category: "activate",
  actions: [],
};

function frame(
  id: string,
  pausedAction: Action,
  overrides: Partial<EffectStackFrame> = {},
): EffectStackFrame {
  return {
    id,
    sourceCardInstanceId: "leader-0",
    controller: 0,
    effectBlock,
    phase: "AWAITING_TARGET_SELECTION",
    pausedAction,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: false,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
    ...overrides,
  };
}

function withStack(state: GameState, effectStack: EffectStackFrame[]): GameState {
  return { ...state, effectStack };
}

describe("OPT-439 rejected response frame restoration", () => {
  it("preserves a nested SELECT_TARGET frame and its continuation on rejection", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const pausedAction: Action = {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { exact: 1 },
      },
    };
    const outer = frame("outer", pausedAction, { phase: "INTERRUPTED_BY_TRIGGERS" });
    const inner = frame("inner", pausedAction, {
      remainingActions: [{ type: "DRAW", params: { amount: 1 } }],
      validTargets: [target.instanceId],
    });
    const state = withStack(base, [outer, inner]);

    const rejected = resumeFromStack(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["stale-target"] },
      cardDb,
    );

    expect(rejected.resolved).toBe(false);
    expect(rejected.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(rejected.state.effectStack.map((entry) => entry.id)).toEqual(["outer", "inner"]);
    expect(rejected.state.effectStack[1].remainingActions).toEqual(inner.remainingActions);

    const handBefore = rejected.state.players[0].hand.length;
    const accepted = resumeFromStack(
      rejected.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
      cardDb,
    );

    expect(accepted.state.effectStack.map((entry) => entry.id)).toEqual(["outer"]);
    expect(accepted.state.players[1].characters.some((card) => card?.instanceId === target.instanceId)).toBe(false);
    expect(accepted.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("preserves the only SELECT_TARGET frame when a stale response is rejected", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = base.players[1].characters.find((card) => card !== null)!;
    const pending = frame("only", {
      type: "KO",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    }, { validTargets: [target.instanceId] });

    const rejected = resumeFromStack(
      withStack(base, [pending]),
      { type: "SELECT_TARGET", selectedInstanceIds: ["stale-target"] },
      cardDb,
    );

    expect(rejected.state.effectStack.map((entry) => entry.id)).toEqual(["only"]);
  });

  it("preserves a mandatory DON-return frame when its choice is rejected", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const pending = frame("don-return", {
      type: "FORCE_OPPONENT_DON_RETURN",
      params: { amount: 2 },
    }, {
      phase: "AWAITING_PLAYER_CHOICE",
      validTargets: ["don-return:1:2"],
    });

    const rejected = resumeFromStack(
      withStack(base, [pending]),
      { type: "PLAYER_CHOICE", choiceId: "stale-choice" },
      cardDb,
    );

    expect(rejected.resolved).toBe(false);
    expect(rejected.state.effectStack.map((entry) => entry.id)).toEqual(["don-return"]);
  });
});
