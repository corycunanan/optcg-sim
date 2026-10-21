import { expect, it } from "vitest";
import { endPhaseRig } from "./opt-962-rig.js";
import { executeAdvancePhase } from "../engine/phases.js";
import { SessionRepository } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import legacy from "./fixtures/opt-966-legacy-explicit-writer.json";
import type { GameAction } from "../types.js";

it("public MAIN→END facade publishes each phase occurrence once", () => {
  const r = endPhaseRig();
  const result = executeAdvancePhase(r.state, r.db);
  expect(
    result.state.eventLog.filter(
      (e) =>
        e.type === "PHASE_CHANGED" &&
        e.payload.from === "MAIN" &&
        e.payload.to === "END"
    )
  ).toHaveLength(1);
  expect(
    result.state.eventLog.filter((e) => e.type === "TURN_ENDED")
  ).toHaveLength(1);
});
it("public refresh/draw facades retain the marked occurrence and draw only once", () => {
  const r = endPhaseRig();
  r.state.turn.phase = "REFRESH";
  const hand = r.state.players[0].hand.length;
  r.state = executeAdvancePhase(r.state, r.db).state;
  expect(r.state.turn.phase).toBe("DRAW");
  r.state = executeAdvancePhase(r.state, r.db).state;
  expect(r.state.turn.phase).toBe("DON");
  expect(r.state.players[0].hand).toHaveLength(hand + 1);
  expect(r.state.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
    1
  );
  for (const from of ["REFRESH", "DRAW"])
    expect(
      r.state.eventLog.filter(
        (e) => e.type === "PHASE_CHANGED" && e.payload.from === from
      )
    ).toHaveLength(1);
});
it("nearby supported legacy phase resume publishes one handoff through live and undo", async () => {
  const storage = new MemorySessionStorage();
  await storage.put(structuredClone(legacy.cases[0].stored));
  const loaded = (await new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  }).load())!;
  for (let state of [loaded.state, loaded.undoHistory[0]]) {
    for (const action of legacy.cases[0].replies) {
      const result = resumePromptLifecycle(
        state,
        action as GameAction,
        loaded.cardDb,
        { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
      );
      expect(result.responseRejected).toBe(false);
      state = result.state;
    }
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toEqual([]);
    expect(state.eventLog.filter((e) => e.type === "TURN_ENDED")).toHaveLength(
      1
    );
    expect(
      state.eventLog.filter(
        (e) => e.type === "PHASE_CHANGED" && e.payload.from === "END"
      )
    ).toHaveLength(1);
  }
});
