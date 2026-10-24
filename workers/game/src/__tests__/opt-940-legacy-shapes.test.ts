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
  toPersistedGameState,
  classifyLegacyShapes,
  isLegacyCostTransactionFrame,
  isStuckDamageStep,
} from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";
import { battleContinuation, battleTriggerLifeCard, effectTriggerWindow, patchBattleContinuation } from "./trigger-window-helpers.js";

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

describe("OPT-962 legacy stage keeps the version 1 resume on the version 2 engine", () => {
  it("drains and hands off without running the staged End Phase: no wave, no expiry, the v1 event order", () => {
    const raw = structuredClone(golden("end-phase-parked").session.state) as Record<string, unknown> & { activeEffects: unknown[]; turn: { number: number } };
    // A "during this turn" effect still present at the v1 boundary. v1 already ran
    // its End Phase expiry before parking, so the legacy resume must not expire it;
    // a staged End Phase (6-6-1-3) would.
    raw.activeEffects = [{
      id: "opt962-legacy-during",
      sourceCardInstanceId: "golden-when-attacking",
      sourceEffectBlockId: "syn",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: raw.turn.number, player: 0 },
      controller: 0,
      appliesTo: [],
      timestamp: 1,
    }];
    const state = convertPersistedGameState(raw, "state");
    expect(state.effectStack.find((f) => f.phaseBoundaryContinuation)?.phaseBoundaryContinuation?.stage).toBe("LEGACY_SCHEDULED_ACTIONS");
    const cardDb = new Map(Object.entries(golden("end-phase-parked").cardDb) as Array<[string, never]>);
    const from = state.eventLog.length;
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [], promptId: state.pendingPrompt!.promptId },
      cardDb,
      lifecycleServices
    );
    expect(result.state.eventLog.slice(from).map((e) => e.type)).toEqual([
      "CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE", "TURN_ENDED", "TURN_STARTED", "PHASE_CHANGED",
    ]);
    expect(result.state.activeEffects.map((e) => e.id)).toEqual(["opt962-legacy-during"]);
  });
});

describe("OPT-962 legacy stage: a terminal remaining action keeps its events before GAME_OVER", () => {
  it("the legacy resume publishes the draw that emptied the deck before the one GAME_OVER", () => {
    const raw = structuredClone(golden("end-phase-parked").session.state) as Record<string, unknown> & {
      players: Array<{ deck: unknown[] }>;
      effectStack: Array<{ phaseBoundaryContinuation?: { remainingScheduledActions: Array<{ action: unknown }> } }>;
    };
    raw.players[0].deck = raw.players[0].deck.slice(0, 1);
    raw.effectStack.find((f) => f.phaseBoundaryContinuation)!.phaseBoundaryContinuation!.remainingScheduledActions[0].action =
      { type: "DRAW", params: { amount: 2 } };
    const state = convertPersistedGameState(raw, "state");
    const cardDb = new Map(Object.entries(golden("end-phase-parked").cardDb) as Array<[string, never]>);
    const from = state.eventLog.length;
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [], promptId: state.pendingPrompt!.promptId },
      cardDb,
      lifecycleServices
    );
    const types = result.state.eventLog.slice(from).map((e) => e.type);
    expect(result.state.status).toBe("FINISHED");
    expect(types).toContain("CARD_DRAWN");
    expect(types.at(-1)).toBe("GAME_OVER");
    expect(types.filter((t) => t === "GAME_OVER")).toHaveLength(1);
    expect(types).not.toContain("TURN_ENDED");
  });
});

describe("OPT-962 legacy stage with a pending OP15-022 Brook delayed loss (the one scoped difference from base)", () => {
  // OP15-022 (docs/cards/OP-15.md:158): "You lose at the end of the turn in which
  // your deck becomes 0 cards." Base opened this window only after the hand-off,
  // where the reset deck-zero flag hid it, so base handed off. OPT-962 opens it at
  // the 6-6-1-4 boundary on the legacy path too: the game ends before the hand-off.
  it("a converted legacy frame resumes, then Brook's loss lands before the hand-off even with a refilled deck", () => {
    const raw = structuredClone(golden("end-phase-parked").session.state) as Record<string, unknown> & {
      players: Array<{ leader: { cardId: string }; deck: unknown[] }>;
      turn: { deckHitZeroThisTurn: [boolean, boolean] };
    };
    raw.players[0].leader.cardId = "OP15-022";
    raw.turn.deckHitZeroThisTurn = [true, false];
    expect(raw.players[0].deck.length).toBeGreaterThan(1);
    const state = convertPersistedGameState(raw, "state");
    const cardDb = new Map(Object.entries(golden("end-phase-parked").cardDb) as Array<[string, never]>);
    const brook = getEffectSchema("OP15-022")!;
    cardDb.set("OP15-022", { ...(cardDb.values().next().value as unknown as object), id: "OP15-022", name: "Brook", type: "Leader", effectSchema: brook } as never);
    const from = state.eventLog.length;
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [], promptId: state.pendingPrompt!.promptId },
      cardDb,
      lifecycleServices
    );
    const types = result.state.eventLog.slice(from).map((e) => e.type);
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.winner).toBe(1);
    expect(types).toContain("CARD_DRAWN");
    expect(types.at(-1)).toBe("GAME_OVER");
    expect(types).not.toContain("TURN_ENDED");
    expect(result.state.turn.activePlayerIndex).toBe(0);
  });
});

describe("OPT-940 structural ResumeContext: lifted to one frame", () => {
  it("loads live and as undo with a frame reference and resumes through the stack", async () => {
    for (const state of [loadLive("structural-resume-context"), await loadAsUndo("structural-resume-context")]) {
      expect(state.effectStack).toHaveLength(1);
      expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[0].id);
      expect(classifyLegacyShapes(state)).toEqual([]);
    }
    const state = loadLive("structural-resume-context");
    // A constructed surviving Leader watcher exposes the old fallback's
    // dropped scan obligation as well as its dropped event publication.
    const watcher = { id: "legacy-ko-watch", category: "auto" as const,
      trigger: { event: "ANY_CHARACTER_KO" as const, filter: { controller: "OPPONENT" as const } },
      actions: [{ type: "DRAW" as const, params: { amount: 1 } }] };
    state.triggerRegistry.push({ id: "legacy-ko-watch", sourceCardInstanceId: state.players[0].leader.instanceId,
      effectBlockId: watcher.id, trigger: watcher.trigger, effectBlock: watcher, zone: "FIELD", controller: 0 });
    const cardDb = new Map(Object.entries(golden("structural-resume-context").cardDb) as Array<[string, never]>);
    const target = (state.pendingPrompt!.options as { validTargets: string[] }).validTargets[0];
    const result = resumePromptLifecycle(
      state,
      { type: "SELECT_TARGET", selectedInstanceIds: [target], promptId: state.pendingPrompt!.promptId },
      cardDb,
      lifecycleServices
    );
    expect(result.responseRejected).toBe(false);
    // The retired fallback dropped resumed events. The common frame path
    // intentionally publishes the committed K.O. once.
    expect(state.players[1].characters.some((card) => card?.instanceId === target)).toBe(true);
    expect(result.state.players[1].characters.some((card) => card?.instanceId === target)).toBe(false);
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.eventLog.filter(event => event.type === "CARD_KO")).toHaveLength(1);
    expect(result.state.eventLog.filter(event => event.type === "CARD_DRAWN")).toHaveLength(1);
    const duplicate = resumePromptLifecycle(result.state, { type: "SELECT_TARGET", selectedInstanceIds: [target] }, cardDb, lifecycleServices);
    expect(duplicate.responseRejected).toBe(true);
    expect(duplicate.state.eventLog).toEqual(result.state.eventLog);
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
      expect(battleContinuation(state)).toMatchObject({
        stage: "CHARACTER_KO_REPLACEMENT",
        targetInstanceId: "char-1-gone",
      });
      expect(classifyLegacyShapes(state)).toEqual([{ shape: "legacy.stuck_damage_step" }]);
    }
  });

  it("classifies an unanswered frame even if its target remains on the field", () => {
    const state = loadLive("stuck-damage-step");
    const onField = patchBattleContinuation(state, {
      targetInstanceId: state.players[1].characters[0]!.instanceId,
    });
    expect(isStuckDamageStep(onField)).toBe(true);
    expect(classifyLegacyShapes(onField)).toEqual([{ shape: "legacy.stuck_damage_step" }]);
    expect(isStuckDamageStep({ ...onField, effectStack: [] })).toBe(true);
  });
});

describe("OPT-963 both Trigger windows open (review finding A): recovered by the lift as nested frames", () => {
  it("loads the real-engine state live and as undo as a battle frame below an effect frame, the prompt on the inner window", async () => {
    for (const state of [loadLive("both-trigger-windows"), await loadAsUndo("both-trigger-windows")]) {
      expect(state.turn.battleSubPhase).toBe("DAMAGE_STEP");
      expect(battleTriggerLifeCard(state)).toBeTruthy();
      expect(effectTriggerWindow(state)).toBeTruthy();
      expect(state.effectStack.map((frame) => (frame.battleDamage ? "BATTLE_DAMAGE" : "EFFECT_DAMAGE"))).toEqual([
        "BATTLE_DAMAGE",
        "EFFECT_DAMAGE",
      ]);
      expect(state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
      expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[1].id);
      expect(state.pendingPrompt?.respondingPlayer).toBe(effectTriggerWindow(state)!.damagedPlayerIndex);
      expect(classifyLegacyShapes(state)).toEqual([]);
    }
  });
});

describe("OPT-963 Phase 1 records: lifted into version 3 frames by the reader", () => {
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
    expect(undo).toEqual(toPersistedGameState({ ...live, schemaVersion: 8, costSemanticsVersion: 7 }));
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


describe("OPT-965 terminal and structural ownership on live/undo load", () => {
  for (const location of ["state", "undoHistory[0]"]) {
    it(`${location}: terminal cleanup discards validated legacy decisions without another outcome`, () => {
      const raw = golden("structural-resume-context").session.state;
      const terminal = { ...raw, status: "FINISHED", winner: 0, winReason: "concession" };
      const before = structuredClone(terminal);
      const loaded = convertPersistedGameState(terminal, location);
      expect(loaded.status).toBe("FINISHED");
      expect(loaded.winner).toBe(0);
      expect(loaded.eventLog).toEqual(raw.eventLog);
      expect(loaded.effectStack).toEqual([]);
      expect(loaded.pendingPrompt).toBeNull();
      expect(loaded.turn.battle).toBeNull();
      expect(terminal).toEqual(before);
    });

    it(`${location}: lifted structural work has one durable owner and deterministic reload`, () => {
      const raw = golden("structural-resume-context").session.state;
      const first = convertPersistedGameState(structuredClone(raw), location);
      expect(first).toEqual(convertPersistedGameState(structuredClone(raw), location));
      const written = toPersistedGameState(first);
      expect(typeof written.pendingPrompt?.resumeContext).toBe("string");
      expect(convertPersistedGameState(written, location)).toEqual({ ...first, schemaVersion: 8, costSemanticsVersion: 6 });
      expect(written.effectStack).toHaveLength(1);
    });

    it(`${location}: unknown structural payload is rejected instead of silently dropped`, () => {
      const raw = golden("structural-resume-context").session.state;
      const prompt = raw.pendingPrompt as Record<string, unknown>;
      prompt.resumeContext = { ...(prompt.resumeContext as object), unknownExecutableWork: [] };
      expect(() => convertPersistedGameState(raw, location)).toThrow("unknown field unknownExecutableWork");
    });
  }
});


describe("OPT-965 historical structural optional effect", () => {
  for (const location of ["state", "undoHistory[0]"]) {
    it(`${location}: accepts an optional suffix through one ordinary frame`, () => {
      const original = golden("structural-resume-context");
      const raw = original.session.state;
      const prompt = raw.pendingPrompt as { options: Record<string, unknown>; resumeContext: Record<string, unknown> };
      prompt.options = { promptType: "OPTIONAL_EFFECT", effectDescription: "Draw one" };
      prompt.resumeContext = { ...prompt.resumeContext, pausedAction: null, remainingActions: [{ type: "DRAW", params: { amount: 1 } }] };
      const state = convertPersistedGameState(raw, location);
      const controller = state.pendingPrompt!.respondingPlayer;
      const before = state.players[controller].hand.length;
      const skipped = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId: "skip" }, new Map(Object.entries(original.cardDb)) as never, lifecycleServices);
      expect(skipped.responseRejected).toBe(true);
      expect(skipped.state).toBe(state);
      const result = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId: "accept" }, new Map(Object.entries(original.cardDb)) as never, lifecycleServices);
      expect(result.responseRejected).toBe(false);
      expect(result.state.players[controller].hand).toHaveLength(before + 1);
      expect(result.state.pendingPrompt).toBeNull();
      expect(result.state.effectStack).toEqual([]);
      expect(convertPersistedGameState(toPersistedGameState(state), location)).toEqual({ ...state, schemaVersion: 8, costSemanticsVersion: 6 });
    });
  }
});
