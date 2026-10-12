/**
 * OPT-940 legacy shape dispositions (docs/game-engine/SAVED-STATE-COMPATIBILITY.md §4).
 *
 * Every fixture here is SYNTHETIC (real engine states and constructed shapes
 * serialized through the base-commit writer), never a captured session.
 * Each shape must load through the one conversion entry point with its
 * documented disposition, for the live state and for an undo snapshot.
 */

import { describe, expect, it } from "vitest";
import type { GameState } from "../types.js";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
  convertPersistedGameState,
} from "../session/persistence.js";
import {
  classifyLegacyShapes,
  isLegacyCostTransactionFrame,
  isStuckDamageStep,
} from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";

function golden(name: string) {
  const entry = loadGoldenFixture().cases[name];
  if (!entry) throw new Error(`no golden case named ${name}`);
  return {
    session: JSON.parse(entry.sessionJson) as { state: Record<string, unknown> },
    cardDb: JSON.parse(entry.cardDbJson) as Record<string, unknown>,
    undoHistory: JSON.parse(entry.undoHistoryJson) as Record<string, unknown>[],
  };
}

function loadLive(name: string): GameState {
  return convertPersistedGameState(golden(name).session.state, "state");
}

/** The same shape stored as the undo snapshot of a clean live state. */
async function loadAsUndo(name: string): Promise<GameState> {
  const live = golden("battle-ready-with-undo");
  const shaped = golden(name);
  const storage = new MemorySessionStorage();
  storage.data.set(SESSION_STORAGE_KEY, live.session);
  storage.data.set(SESSION_CARD_DB_STORAGE_KEY, live.cardDb);
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, [shaped.session.state]);
  const loaded = await new SessionRepository(storage, {
    nextJsUrl: "https://app.example.test",
    workerSecret: "secret",
  }).load();
  return loaded!.undoHistory[0];
}

const lifecycleServices = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};

describe("OPT-940 stage-less PhaseBoundaryContinuation: lossless, legacy semantics preserved", () => {
  // OPT-980: the v1 → v2 converter gives the stage-less frame the dedicated
  // legacy stage and changes nothing else (SAVED-STATE-COMPATIBILITY.md §6).
  it("loads live and as undo, converted to LEGACY_SCHEDULED_ACTIONS, classified, with the remaining scheduled action intact", async () => {
    for (const state of [loadLive("end-phase-parked"), await loadAsUndo("end-phase-parked")]) {
      const phaseFrame = state.effectStack.find((frame) => frame.phaseBoundaryContinuation)!;
      expect(phaseFrame.phaseBoundaryContinuation).toEqual({
        kind: "END_PHASE",
        endingPlayerIndex: 0,
        stage: "LEGACY_SCHEDULED_ACTIONS",
        remainingScheduledActions: [
          { action: { type: "DRAW", params: { amount: 1 } }, controller: 0, sourceEffectId: "golden-when-attacking-2" },
        ],
      });
      expect(phaseFrame.phaseBoundaryContinuation).not.toHaveProperty("activatedWaveEffects");
      expect(state.turn.phase).toBe("END");
      expect(classifyLegacyShapes(state)).toEqual([
        { shape: "legacy.stage_less_phase_boundary", frameId: phaseFrame.id },
      ]);
    }
  });

  it("resumes the remaining scheduled action exactly once and hands off; no wave is started and no expiry is repeated", () => {
    const state = loadLive("end-phase-parked");
    const cardDb = new Map(
      Object.entries(golden("end-phase-parked").cardDb) as Array<[string, never]>
    );
    const prompt = state.pendingPrompt!;
    expect(prompt.options.promptType).toBe("SELECT_TARGET");
    const handBefore = state.players[0].hand.length;
    const drawsBefore = state.eventLog.filter((event) => event.type === "CARD_DRAWN").length;

    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [], promptId: prompt.promptId },
      cardDb,
      lifecycleServices
    );

    expect(result.responseRejected).toBe(false);
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.pendingPrompt).toBeNull();
    // Exactly the one remaining scheduled DRAW ran.
    expect(result.state.players[0].hand.length).toBe(handBefore + 1);
    expect(result.state.eventLog.filter((event) => event.type === "CARD_DRAWN").length).toBe(drawsBefore + 1);
    // Hand-off happened once, after the scheduled work.
    const types = result.state.eventLog.map((event) => event.type);
    expect(types.filter((type) => type === "TURN_ENDED")).toHaveLength(1);
    expect(types.indexOf("CARD_DRAWN")).toBeLessThan(types.indexOf("TURN_ENDED"));
    expect(result.state.turn.activePlayerIndex).toBe(1);
    expect(result.state.turn.phase).toBe("REFRESH");
  });
});

describe("OPT-940 structural ResumeContext: supported as-is", () => {
  it("loads live and as undo, classified, and still resumes through resumeEffectChain", async () => {
    for (const state of [loadLive("structural-resume-context"), await loadAsUndo("structural-resume-context")]) {
      expect(state.effectStack).toEqual([]);
      expect(classifyLegacyShapes(state)).toEqual([{ shape: "legacy.structural_resume_context" }]);
    }
    const state = loadLive("structural-resume-context");
    const cardDb = new Map(Object.entries(golden("structural-resume-context").cardDb) as Array<[string, never]>);
    const target = (state.pendingPrompt!.options as { validTargets: string[] }).validTargets[0];
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [target], promptId: state.pendingPrompt!.promptId },
      cardDb,
      lifecycleServices
    );
    expect(result.responseRejected).toBe(false);
    // The legacy path applies the resumed state directly (prompt-lifecycle.ts
    // publishes no events for it), so observe the zone, not the event log.
    expect(state.players[1].characters.some((card) => card?.instanceId === target)).toBe(true);
    expect(result.state.players[1].characters.some((card) => card?.instanceId === target)).toBe(false);
    expect(result.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-940 legacy cost-transaction frame: supported as-is", () => {
  it("loads live and as undo, classified by the same predicate resume/cost.ts uses", async () => {
    for (const state of [loadLive("legacy-cost-transaction-frame"), await loadAsUndo("legacy-cost-transaction-frame")]) {
      const frame = state.effectStack[0];
      expect(frame.costTransactionState).toBeUndefined();
      expect(frame.currentCostIndex).toBe(1);
      expect(isLegacyCostTransactionFrame(frame)).toBe(true);
      expect(classifyLegacyShapes(state)).toEqual([
        { shape: "legacy.cost_transaction_frame", frameId: "golden-legacy-cost-frame" },
      ]);
    }
  });

  it("does not classify a staged cost frame", () => {
    const state = loadLive("legacy-cost-transaction-frame");
    const staged = {
      ...state.effectStack[0],
      costTransactionState: {} as NonNullable<GameState["effectStack"][0]["costTransactionState"]>,
    };
    expect(isLegacyCostTransactionFrame(staged)).toBe(false);
  });
});

describe("OPT-940 stuck DAMAGE_STEP (OPT-884): loaded as-is and classified", () => {
  it("loads live and as undo with the continuation intact; the structural contradictions are rejected elsewhere", async () => {
    for (const state of [loadLive("stuck-damage-step"), await loadAsUndo("stuck-damage-step")]) {
      expect(isStuckDamageStep(state)).toBe(true);
      expect(state.turn.pendingBattleDamageContinuation).toMatchObject({
        stage: "CHARACTER_KO_REPLACEMENT",
        targetInstanceId: "char-1-gone",
      });
      expect(classifyLegacyShapes(state)).toEqual([{ shape: "legacy.stuck_damage_step" }]);
    }
  });

  it("is not stuck while the target is still on the field or a prompt is open", () => {
    const state = loadLive("stuck-damage-step");
    const onField: GameState = {
      ...state,
      turn: {
        ...state.turn,
        pendingBattleDamageContinuation: {
          ...state.turn.pendingBattleDamageContinuation!,
          targetInstanceId: state.players[1].characters[0]!.instanceId,
        } as GameState["turn"]["pendingBattleDamageContinuation"],
      },
    };
    expect(isStuckDamageStep(onField)).toBe(false);
    expect(classifyLegacyShapes(onField)).toEqual([]);
  });
});

describe("OPT-940 both Trigger windows open (review finding A): loaded as-is and classified", () => {
  it("loads the real-engine state live and as undo with the battle prompt intact", async () => {
    for (const state of [loadLive("both-trigger-windows"), await loadAsUndo("both-trigger-windows")]) {
      expect(state.turn.battleSubPhase).toBe("DAMAGE_STEP");
      expect(state.turn.battle?.pendingTriggerLifeCard).toBeTruthy();
      expect(state.turn.pendingTriggerFromEffect).toBeTruthy();
      expect(state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
      expect(state.effectStack).toEqual([]);
      expect(classifyLegacyShapes(state)).toEqual([{ shape: "legacy.two_trigger_windows" }]);
    }
  });
});

describe("OPT-940 Phase 1 records: supported as-is under version 1", () => {
  it.each([
    "battle-trigger-window",
    "effect-damage-trigger-window",
    "replacement-prompt",
    "replacement-batch-prompt",
    "batch-resume-frame",
    "trigger-order-prompt",
  ])("%s loads live and as undo without classification", async (name) => {
    const live = loadLive(name);
    const undo = await loadAsUndo(name);
    expect(undo).toEqual(live);
    expect(classifyLegacyShapes(live)).toEqual([]);
  });
});

describe("OPT-940 clean states carry no legacy classification", () => {
  it.each(["fresh-setup", "pregame-priority-roll", "battle-ready-with-undo", "effect-frame-prompt", "finished"])(
    "%s",
    (name) => {
      expect(classifyLegacyShapes(loadLive(name))).toEqual([]);
    }
  );
});
