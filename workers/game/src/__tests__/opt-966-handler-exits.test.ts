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
