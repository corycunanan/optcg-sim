import { reenterBatchResume, pushBatchResumeFrame } from "../engine/effect-resolver/resume/batch.js";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import { expect, it } from "vitest";
import type { GameAction, ResumeContext } from "../types.js";
import { resumeEffectChain } from "../engine/effect-resolver/resume.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { terminateGame } from "../engine/terminal.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

it.each<GameAction>([{ type: "PASS" }, { type: "PLAYER_CHOICE", choiceId: "skip" }])(
  "a frameless optional skip completes without leaving an idle owner: %j", action => {
    const db = createTestCardDb();
    const state = createBattleReadyState(db);
    const context: ResumeContext = {
      effectSourceInstanceId: state.players[0].leader.instanceId,
      controller: 0, pausedAction: { type: "DRAW", params: { amount: 1 } },
      remainingActions: [], resultRefs: [], validTargets: [],
    };
    const result = resumeEffectChain(state, context, action, db);
    expect(result.kind).toBe("completed");
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.effectStack).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.state.players).toEqual(state.players);
  }
);

it("reports a terminal empty queue explicitly without allocating work", () => {
  const db = createTestCardDb();
  const state = terminateGame(createBattleReadyState(db), { kind: "WIN_GAME", winner: 0 });
  const result = resolverExecutionServices.reportTriggers(state, [], db);
  expect(result.kind).toBe("terminal");
  expect(result.state).toBe(state);
  expect(result.state.effectStack).toEqual([]);
});

it("batch re-entry reports terminal when no work survives", () => {
  const db = createTestCardDb();
  const state = terminateGame(createBattleReadyState(db), { kind: "WIN_GAME", winner: 0 });
  const result = reenterBatchResume(state, db, resolverExecutionServices);
  expect(result.kind).toBe("terminal");
  expect(result.state).toBe(state);
});

it("a lethal batch suffix reports terminal and does not continue its remaining actions", () => {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players[0].deck = state.players[0].deck.slice(0, 1);
  state = pushBatchResumeFrame(state, state.players[0].leader.instanceId, 0,
    CONTINUATION_EFFECT_BLOCK, { kind: "SET_REST", pausedAction: { type: "SET_REST", target: { type: "CHARACTER", controller: "OPPONENT" } },
      remainingTargetIds: [], restedSoFar: [] }, [], [
      { type: "DRAW", params: { amount: 2 } },
      { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } },
    ], new Map());
  const result = reenterBatchResume(state, db, resolverExecutionServices);
  expect(result.kind).toBe("terminal");
  expect(result.state.status).toBe("FINISHED");
  expect(result.state.effectStack).toEqual([]);
  expect(result.events.some(event => event.type === "POWER_MODIFIED")).toBe(false);
});
