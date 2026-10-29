import { continuationBoundary } from "../engine/effect-stack.js";
import { advancePhaseBoundary } from "../engine/phases.js";
import type { GameState } from "../types.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { describe, expect, it } from "vitest";
import { endPhaseRig } from "./opt-962-rig.js";
import { fieldTrashSemanticsVersion } from "../engine/field-trash-semantics.js";
import { GAME_STATE_SCHEMA_VERSION, toPersistedGameState } from "../session/game-state-schema.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { convertPersistedGameState, SessionRepository } from "../session/persistence.js";
import { SessionCoordinator } from "../session/coordinator.js";

// Synthetic ingress matrix isolates producer eligibility; no state is retagged11.
function obligations(version: number | undefined, cost: 6 | 7 | 8 | undefined, count = 2, trash: 8 | 9 = 8) {
  const r = endPhaseRig();
  r.state.schemaVersion = version as GameState["schemaVersion"];
  r.state.costSemanticsVersion = cost;
  if (version === 10) r.state.fieldTrashSemanticsVersion = trash;
  r.state.scheduledActions = Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${index}`, timing: "END_OF_THIS_TURN" as const, controller: 0 as const,
    sourceEffectId: r.state.players[0].leader.instanceId, boundToInstanceId: null,
    action: { type: "DRAW" as const, params: { amount: 0 } },
  }));
  return r;
}

describe("OPT-981 producer-only writer11", () => {
  it.each([8, 9, 10])("promotes explicit schema%i only at the ordering producer, preserving all capabilities", version => {
    for (const cost of [6, 7, 8] as const) for (const trash of [8, 9] as const) {
      const r = obligations(version, cost, 2, trash);
      const before = structuredClone(r.state);
      const expectedTrash = fieldTrashSemanticsVersion(before);
      r.act({ type: "ADVANCE_PHASE" });
      expect(r.state.schemaVersion).toBe(11);
      expect(r.state.costSemanticsVersion).toBe(cost);
      expect(fieldTrashSemanticsVersion(r.state)).toBe(expectedTrash);
      expect(r.state.effectStack.at(-1)?.phaseBoundaryContinuation?.awaitingOrder).toBe(true);
      const wire = JSON.parse(JSON.stringify(toPersistedGameState(r.state)));
      expect(convertPersistedGameState(wire, "state").schemaVersion).toBe(11);
      expect(before.schemaVersion).toBe(version);
    }
  });

  it.each([0, 1])("does not promote or ask when only %i obligations exist", count => {
    const r = obligations(8, 8, count);
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.schemaVersion).toBe(8);
    expect(r.state.pendingPrompt).toBeNull();
    expect(GAME_STATE_SCHEMA_VERSION).toBe(8);
  });

  it.each([undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9])("does not infer modern capabilities for raw historical schema%s", version => {
    const r = obligations(version, undefined);
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.schemaVersion).toBe(version);
    expect(r.state.pendingPrompt).toBeNull();
  });

  it("keeps a legacy scheduled cohort unpromoted even with explicit modern capabilities", () => {
    const r = obligations(8, 8);
    const boundary = continuationBoundary(r.state, r.state.players[0].leader.instanceId, 0);
    boundary.frame.phaseBoundaryContinuation = { kind: "END_PHASE", endingPlayerIndex: 0,
      stage: "LEGACY_SCHEDULED_ACTIONS", remainingScheduledActions: r.state.scheduledActions.map(entry => ({ ...entry, sourceInstanceId: entry.sourceEffectId })) };
    r.state = { ...boundary.state, scheduledActions: [], effectStack: [boundary.frame] };
    const result = advancePhaseBoundary(r.state, r.db);
    expect(result.state.schemaVersion).toBe(8);
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.effectStack.at(-1)?.phaseBoundaryContinuation?.awaitingOrder).toBeUndefined();
  });

  it("rejects missing or malformed capability provenance at session ingress without mutation", () => {
    for (const [version, cost, trash] of [[8, undefined, undefined], [9, 5, undefined], [10, 8, undefined], [10, 8, 7]] as const) {
      const r = obligations(8, 8);
      const raw = { ...r.state, schemaVersion: version, costSemanticsVersion: cost,
        ...(version === 10 ? { fieldTrashSemanticsVersion: trash } : {}) } as GameState;
      const before = structuredClone(raw);
      const result = new SessionCoordinator().executeAction(raw, [], 0, { type: "ADVANCE_PHASE" }, r.db);
      expect(result.kind).toBe("reject"); expect(result.state).toEqual(before);
    }
  });

  it("does not publish promotion on rejected actions, wrong owner or stale/invalid responses", async () => {
    const r = obligations(8, 8);
    const coordinator = new SessionCoordinator();
    const before = structuredClone(r.state);
    const reject = coordinator.executeAction(r.state, [], 1, { type: "ADVANCE_PHASE" }, r.db);
    expect(reject.kind).toBe("reject"); expect(reject.state).toEqual(before);
    r.act({ type: "ADVANCE_PHASE" });
    const repository = new SessionRepository(new MemorySessionStorage(), { nextJsUrl: "https://example.test", workerSecret: "synthetic" });
    await repository.save({ state: r.state, cardDb: r.db, undoHistory: [], mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
    r.state = (await repository.load())!.state;
    const offered = structuredClone(r.state);
    for (const [owner, choice, promptId] of [[1, "end-of-turn-obligation:0", r.state.pendingPrompt!.promptId], [0, "end-of-turn-obligation:0", "stale"], [0, "done", r.state.pendingPrompt!.promptId]] as const) {
      const result = coordinator.executeAction(r.state, [], owner, { type: "PLAYER_CHOICE", choiceId: choice, promptId }, r.db);
      if (result.kind === "resume") {
        const resumed = resumePromptLifecycle(result.state, { type: "PLAYER_CHOICE", choiceId: choice, promptId }, r.db, {
          drainPregame: state => state, advanceStartOfTurn: state => state,
        });
        expect(resumed.responseRejected).toBe(true); expect(resumed.state).toEqual(offered);
      } else { expect(result.kind).toBe("reject"); expect(result.state).toEqual(offered); }
    }
  });
});
