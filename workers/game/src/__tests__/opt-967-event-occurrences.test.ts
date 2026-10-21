import { expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { createEffectExecutionScope } from "../engine/trigger-executor.js";
import { reportExecutionEvents } from "../engine/trigger-queue.js";
import { drainPendingWork } from "../engine/pending-work-drain.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { PendingEvent } from "../types.js";

it("transfers each distinct occurrence once without mutating its retained original, through a prompt and live/undo reload", async () => {
  const r = endPhaseRig();
  r.putSyn(
    "OCCURRENCE-967",
    synSchema("OCCURRENCE-967", "Character", [
      {
        id: "observe",
        category: "auto",
        trigger: { event: "DRAW_OUTSIDE_DRAW_PHASE" },
        actions: [
          {
            type: "MODIFY_POWER",
            target: { type: "SELF" },
            params: { amount: 0 },
            duration: { type: "THIS_TURN" },
          },
        ],
      },
    ]),
    0,
    "CHARACTER"
  );
  const first: PendingEvent = {
    type: "DRAW_OUTSIDE_DRAW_PHASE",
    playerIndex: 0,
    payload: { count: 1 },
  };
  const second = structuredClone(first);
  let state = createEffectExecutionScope(
    r.state,
    r.state.players[0].leader.instanceId,
    0
  );
  const originalFrame = {
    ...state.effectStack[0],
    accumulatedEvents: [first, second],
  };
  state = { ...state, effectStack: [originalFrame] };
  const report = reportExecutionEvents(
    state,
    { state, events: [first, second] },
    r.db
  );
  expect(originalFrame.accumulatedEvents).toEqual([first, second]);
  expect(first.propagation).toBeUndefined();
  expect(second.propagation).toBeUndefined();
  expect(report.state.effectStack[0]).not.toBe(originalFrame);
  expect(report.state.effectStack[0].accumulatedEvents).toEqual(report.events);
  expect(
    report.events.every(
      (event) =>
        event.propagation?.eventLogEmitted && event.propagation?.triggerScanned
    )
  ).toBe(true);
  expect(
    report.state.eventLog.filter(
      (event) => event.type === "DRAW_OUTSIDE_DRAW_PHASE"
    )
  ).toHaveLength(2);
  const pending = drainPendingWork(
    { state: report.state, events: [], resolved: true },
    r.db,
    resolverExecutionServices
  );
  expect(pending.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  const storage = new MemorySessionStorage();
  const repo = new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  });
  await repo.save({
    state: { ...pending.state, pendingPrompt: pending.pendingPrompt! },
    cardDb: r.db,
    undoHistory: [{ ...pending.state, pendingPrompt: pending.pendingPrompt! }],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  const loaded = (await repo.load())!;
  for (let actual of [loaded.state, loaded.undoHistory[0]]) {
    for (let index = 0; actual.pendingPrompt && index < 3; index++) {
      if (actual.pendingPrompt.options.promptType !== "PLAYER_CHOICE")
        throw new Error("unexpected prompt");
      const choice = actual.pendingPrompt.options.choices!.find(
        (row) => !row.disabled && row.id !== "done"
      )!;
      const reply = resumePromptLifecycle(
        actual,
        { type: "PLAYER_CHOICE", choiceId: choice.id },
        loaded.cardDb,
        { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
      );
      expect(reply.responseRejected).toBe(false);
      actual = reply.state;
    }
    expect(actual.pendingPrompt).toBeNull();
    expect(actual.effectStack).toEqual([]);
    expect(
      actual.eventLog.filter(
        (event) => event.type === "DRAW_OUTSIDE_DRAW_PHASE"
      )
    ).toHaveLength(2);
  }
});
