import { describe, expect, it } from "vitest";
import type { Action, EffectBlock } from "../engine/effect-types.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import type { CardInstance, EffectStackFrame, GameState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

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

  it("replaces a consumed target frame when an accepted play needs an overflow prompt", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const playTarget = base.players[0].hand[0];
    const existing = base.players[0].characters.filter((card): card is CardInstance => card !== null);
    const fillers: CardInstance[] = Array.from({ length: 3 }, (_, index) => ({
      instanceId: `overflow-filler-${index}`,
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    }));
    const fullBoard: GameState = {
      ...base,
      players: [
        { ...base.players[0], characters: padChars([...existing, ...fillers]) },
        base.players[1],
      ],
    };
    const pausedAction: Action = {
      type: "PLAY_CARD",
      target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { exact: 1 } },
      params: { source_zone: "HAND", cost_override: "FREE" },
    };
    const outer = frame("outer", pausedAction, { phase: "INTERRUPTED_BY_TRIGGERS" });
    const pending = frame("play-target", pausedAction, {
      remainingActions: [{ type: "DRAW", params: { amount: 1 } }],
      validTargets: [playTarget.instanceId],
    });

    const overflow = resumeFromStack(
      withStack(fullBoard, [outer, pending]),
      { type: "SELECT_TARGET", selectedInstanceIds: [playTarget.instanceId] },
      cardDb,
    );

    expect(overflow.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(overflow.state.effectStack).toHaveLength(2);
    expect(overflow.state.effectStack[0].id).toBe("outer");
    expect(overflow.state.effectStack[1].id).not.toBe("play-target");
    const replacement = overflow.state.effectStack[1] as unknown as EffectStackFrame;
    expect(replacement.ruleTrashForPlay?.playTargetId).toBe(playTarget.instanceId);
    expect(replacement.remainingActions).toEqual(pending.remainingActions);

    const victimId = overflow.state.players[0].characters[0]!.instanceId;
    const handBefore = overflow.state.players[0].hand.length;
    const completed = resumeFromStack(
      overflow.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [victimId] },
      cardDb,
    );

    expect(completed.pendingPrompt).toBeUndefined();
    expect(completed.state.effectStack.map((entry) => entry.id)).toEqual(["outer"]);
    expect(completed.state.players[0].characters.filter(Boolean)).toHaveLength(5);
    expect(completed.state.players[0].hand).toHaveLength(handBefore);
  });
});
