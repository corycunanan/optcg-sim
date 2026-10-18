/**
 * OPT-963 (PR 5a of OPT-963): the version 3 reader for typed replacement and
 * damage continuation frames, the v2 → v3 and v3 lowering converters,
 * reference integrity for the new kinds, mixed-version undo, and the
 * unchanged version 2 writer.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §1.7, §2, §8.
 * Fixtures: `fixtures/opt-963-v3-states.ts` (SYNTHETIC: golden version 2
 * engine states lifted to the version 3 shape, plus constructed shapes).
 */

import { reply } from "./fixtures/opt-963-lifecycle.js";
import corpus from "./fixtures/opt-963-5b-written-states.json";
import { describe, expect, it, vi } from "vitest";
import type { CardData, GameState } from "../types.js";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
  convertPersistedGameState,
} from "../session/persistence.js";
import {
  EFFECT_STACK_FRAME_KINDS,
  GAME_STATE_SCHEMA_VERSION,
  GAME_STATE_SCHEMA_VERSION_KEY,
  LATEST_READABLE_GAME_STATE_SCHEMA_VERSION,
  RUNTIME_GAME_STATE_SCHEMA_VERSION,
  SUPPORTED_GAME_STATE_SCHEMA_VERSIONS,
  classifyLegacyShapes,
  frameKindOf,
  lowerVersion3Frames,
  toPersistedGameState,
} from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";
import {
  LOSSLESS_GOLDEN_CASES,
  V3_FRAME_ID,
  buildV3SyntheticStates,
  goldenV2State,
  liftToVersion3,
  persistedV3,
} from "./fixtures/opt-963-v3-states.js";
import * as logModule from "../lib/log.js";

const STATES = buildV3SyntheticStates();
const NAMES = STATES.map((entry) => entry.name);
const byName = (name: string) => STATES.find((entry) => entry.name === name)!;

function golden(name: string) {
  const entry = loadGoldenFixture().cases[name];
  if (!entry) throw new Error(`no golden case named ${name}`);
  return {
    session: JSON.parse(entry.sessionJson) as Record<string, unknown> & { state: Record<string, unknown> },
    cardDb: JSON.parse(entry.cardDbJson) as Record<string, unknown>,
    undoHistory: JSON.parse(entry.undoHistoryJson) as Record<string, unknown>[],
  };
}

function storageWith(state: unknown, undoHistory: unknown[], cardDb?: Record<string, unknown>): MemorySessionStorage {
  const base = golden("battle-ready-with-undo");
  const storage = new MemorySessionStorage();
  storage.data.set(SESSION_STORAGE_KEY, { ...base.session, state });
  storage.data.set(SESSION_CARD_DB_STORAGE_KEY, cardDb ?? base.cardDb);
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, undoHistory);
  storage.writes.length = 0;
  return storage;
}

function repository(storage: MemorySessionStorage): SessionRepository {
  return new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
}

/** A runtime state as the reader returns it: JSON round-tripped (drops undefined fields). */
function runtime(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

const lifecycleServices = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};

describe("OPT-963 version 3 support window (PR 5a)", () => {
  it("reads 1, 2 and 3, executes 2, and writes 2", () => {
    expect([...SUPPORTED_GAME_STATE_SCHEMA_VERSIONS]).toEqual([1, 2, 3]);
    expect(LATEST_READABLE_GAME_STATE_SCHEMA_VERSION).toBe(3);
    expect(RUNTIME_GAME_STATE_SCHEMA_VERSION).toBe(2);
    expect(GAME_STATE_SCHEMA_VERSION).toBe(2);
    expect([...EFFECT_STACK_FRAME_KINDS]).toEqual(
      expect.arrayContaining(["REPLACEMENT", "REPLACEMENT_BATCH", "BATTLE_DAMAGE", "EFFECT_DAMAGE"])
    );
  });

  it("derives the four kinds from their one field, before the phase", () => {
    const [battle] = liftToVersion3(goldenV2State("battle-trigger-window")).effectStack;
    expect(frameKindOf(battle)).toBe("BATTLE_DAMAGE");
    const [effect] = liftToVersion3(goldenV2State("effect-damage-trigger-window")).effectStack;
    expect(frameKindOf(effect)).toBe("EFFECT_DAMAGE");
    const replacement = liftToVersion3(goldenV2State("replacement-prompt")).effectStack.at(-1)!;
    expect(frameKindOf(replacement)).toBe("REPLACEMENT");
    const batch = liftToVersion3(goldenV2State("replacement-batch-prompt")).effectStack.at(-1)!;
    expect(frameKindOf(batch)).toBe("REPLACEMENT_BATCH");
    expect(frameKindOf({ ...batch, phase: "INTERRUPTED_BY_TRIGGERS" })).toBe("REPLACEMENT_BATCH");
  });
});

describe("OPT-963 v3 reader: every shape loads live and as undo, lowered to its version 2 record", () => {
  it.each(NAMES)("%s loads live, lowered, with the documented reports", (name) => {
    const entry = byName(name);
    const logSpy = vi.spyOn(logModule, "log").mockImplementation(() => {});
    try {
      const loaded = convertPersistedGameState(persistedV3(entry.state), "state");
      expect(loaded).toEqual(runtime(entry.lowered));
      expect(loaded).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
      const shapes = logSpy.mock.calls
        .filter(([event]) => event === "session.legacy_shape")
        .map(([, data]) => (data as { shape: string }).shape)
        .filter((shape) => shape.startsWith("lowered."));
      expect(shapes).toEqual(entry.reports);
    } finally {
      logSpy.mockRestore();
    }
  });

  it.each(NAMES)("%s loads as an undo snapshot through the same hook", async (name) => {
    const entry = byName(name);
    const live = golden("battle-ready-with-undo");
    const loaded = (await repository(storageWith(live.session.state, [persistedV3(entry.state)])).load())!;
    expect(loaded.undoHistory[0]).toEqual(runtime(entry.lowered));
  });

  it("lowers nothing on a state without version 3 frames (same object)", () => {
    const state = goldenV2State("effect-frame-prompt");
    expect(lowerVersion3Frames(state).state).toBe(state);
  });

  it.each([...LOSSLESS_GOLDEN_CASES])("%s: lift then lower is the identity on the version 2 golden", (name) => {
    const v2 = goldenV2State(name);
    const lowered = lowerVersion3Frames(liftToVersion3(v2));
    expect(runtime(lowered.state)).toEqual(runtime(v2));
    expect(lowered.reports.every((report) => !report.shape.includes("dropped"))).toBe(true);
  });

  it("keeps OPT-884's evidence: the stuck Damage Step classifies after lowering", () => {
    const loaded = convertPersistedGameState(persistedV3(byName("stuck-damage-step").state), "state");
    expect(classifyLegacyShapes(loaded).map((report) => report.shape)).toContain("legacy.stuck_damage_step");
  });

  it("both-trigger-windows: nested frames lower to the two version 2 records (base behavior, classified)", () => {
    const entry = byName("both-trigger-windows");
    expect(entry.state.effectStack.map(frameKindOf)).toEqual(["BATTLE_DAMAGE", "EFFECT_DAMAGE"]);
    expect(entry.state.pendingPrompt?.resumeContext).toBe(V3_FRAME_ID.effectDamage);
    const loaded = convertPersistedGameState(persistedV3(entry.state), "state");
    expect(loaded.turn.battle?.pendingTriggerLifeCard).toBeTruthy();
    expect(loaded.turn.pendingTriggerFromEffect).toBeTruthy();
    expect(classifyLegacyShapes(loaded).map((report) => report.shape)).toContain("legacy.two_trigger_windows");
  });
});

describe("OPT-963 the version 2 engine resumes a lowered version 3 state (5a is a rollback target)", () => {
  it("battle Trigger window: the REVEAL_TRIGGER reply ends the battle through the coordinator, exactly as from the version 2 state", async () => {
    const entry = golden("battle-trigger-window");
    const storage = storageWith(persistedV3(byName("battle-trigger-window").state), [], entry.cardDb);
    const loaded = (await repository(storage).load())!;
    const v2 = goldenV2State("battle-trigger-window");
    const coordinator = new SessionCoordinator();
    const prompt = loaded.state.pendingPrompt!;
    expect(prompt.options.promptType).toBe("REVEAL_TRIGGER");
    const reply = { type: "REVEAL_TRIGGER" as const, reveal: false, promptId: prompt.promptId };
    const fromLowered = coordinator.executeAction(loaded.state, [], prompt.respondingPlayer, reply, loaded.cardDb);
    const fromV2 = coordinator.executeAction(v2, [], prompt.respondingPlayer, reply, loaded.cardDb);
    expect(fromLowered.kind).toBe("applied");
    expect(fromLowered.state.turn.battle).toBeNull();
    expect(fromLowered.state.turn.battleSubPhase).toBeNull();
    expect(fromLowered.state.players[1].hand.length).toBeGreaterThan(v2.players[1].hand.length);
    expect(fromLowered).toEqual(fromV2);
  });

  it("replacement offer: the decline resumes the chain exactly as the version 2 state does", async () => {
    const v2 = goldenV2State("replacement-prompt");
    const entry = golden("replacement-prompt");
    const storage = storageWith(persistedV3(liftToVersion3(v2)), [], entry.cardDb);
    const loaded = (await repository(storage).load())!;
    const reply = { type: "PASS" as const, promptId: loaded.state.pendingPrompt!.promptId };
    const fromLowered = resumePromptLifecycle(loaded.state, reply, loaded.cardDb, lifecycleServices);
    const fromV2 = resumePromptLifecycle({ ...v2, pendingPrompt: loaded.state.pendingPrompt }, reply, loaded.cardDb, lifecycleServices);
    expect(fromLowered.responseRejected).toBe(false);
    expect(fromLowered).toEqual(fromV2);
  });
});

describe("OPT-963 mixed-version undo history", () => {
  it("[2, 3]: a version 2 live state with a version 3 undo snapshot loads", async () => {
    const live = golden("battle-ready-with-undo");
    const undo = persistedV3(byName("battle-trigger-window").state);
    const loaded = (await repository(storageWith(live.session.state, [undo])).load())!;
    expect(loaded.state).toEqual(convertPersistedGameState(live.session.state, "state"));
    expect(loaded.undoHistory[0]).toEqual(runtime(goldenV2State("battle-trigger-window")));
  });

  it("[3, 2]: a version 3 live state with a version 2 undo snapshot loads, and re-saves as version 2", async () => {
    const v1Undo = golden("battle-ready-with-undo").undoHistory;
    const entry = golden("replacement-batch-prompt");
    const storage = storageWith(persistedV3(byName("replacement-batch-prompt").state), v1Undo, entry.cardDb);
    const first = (await repository(storage).load())!;
    expect(first.state).toEqual(runtime(goldenV2State("replacement-batch-prompt")));
    const target = new MemorySessionStorage();
    const saved = await repository(target).save(first);
    const written = target.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
    expect(written.state[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(2);
    expect(JSON.stringify(written.state)).not.toContain("replacementBatch\"");
    const second = (await repository(target).load())!;
    expect(second.state).toEqual(saved.state);
  });

  it("the writer labels a lowered state as version 2 (writer unchanged by PR 5a)", () => {
    const loaded = convertPersistedGameState(persistedV3(byName("effect-window-with-parent-chain").state), "state");
    const out = toPersistedGameState(loaded) as unknown as Record<string, unknown>;
    expect(out[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(2);
    expect(convertPersistedGameState(out, "state")).toEqual(loaded);
  });
});

describe("OPT-963 reference integrity for the new kinds, with a located reason", () => {
  type Raw = Record<string, unknown> & {
    effectStack: Array<Record<string, unknown>>;
    pendingPrompt: Record<string, unknown> | null;
    turn: Record<string, unknown>;
  };
  const raw = (name: string): Raw => persistedV3(byName(name).state) as Raw;
  const expectRejected = (state: Raw, message: string | RegExp) =>
    expect(() => convertPersistedGameState(state, "state")).toThrow(message);

  it("rejects a REVEAL_TRIGGER prompt naming a frame that is not a damage frame", () => {
    const state = raw("battle-trigger-window");
    state.effectStack[0] = { ...state.effectStack[0], battleDamage: undefined, phase: "AWAITING_TARGET_SELECTION" };
    expectRejected(state, /pendingPrompt\.resumeContext names frame "v3-battle-damage" of kind EFFECT for a REVEAL_TRIGGER prompt; only a damage frame owns one/);
  });

  it("rejects an OPTIONAL_EFFECT prompt naming a damage frame", () => {
    const state = raw("replacement-prompt");
    const battle = raw("battle-trigger-window").effectStack[0];
    state.effectStack = [{ ...battle, id: "v3-replacement" }];
    expectRejected(state, /names BATTLE_DAMAGE frame "v3-replacement" for a OPTIONAL_EFFECT prompt/);
  });

  it("rejects a damage frame owning a prompt while not at AWAITING_TRIGGER_REVEAL", () => {
    const state = raw("battle-trigger-window");
    state.effectStack[0] = {
      ...state.effectStack[0],
      phase: "INTERRUPTED_BY_TRIGGERS",
      battleDamage: { stage: "TRIGGER_EFFECT", battleId: "b", damagedPlayerIndex: 1, lifeCardInstanceId: "x" },
    };
    expectRejected(state, /a damage frame owns only its REVEAL_TRIGGER at AWAITING_TRIGGER_REVEAL/);
  });

  it("rejects a REPLACEMENT frame below another frame", () => {
    const state = raw("replacement-prompt");
    const above = raw("effect-window-with-parent-chain").effectStack[0];
    state.effectStack = [...state.effectStack, { ...above, id: "above" }];
    expectRejected(state, /names REPLACEMENT frame "v3-replacement", which is not the top frame/);
  });

  it("rejects a REPLACEMENT frame that no prompt names", () => {
    const state = raw("replacement-prompt");
    state.pendingPrompt = null;
    expectRejected(state, /effectStack\[0\] \(frame "v3-replacement"\) is a REPLACEMENT frame waiting for an answer, but pendingPrompt does not name it/);
  });

  it("rejects an effectDamage.parentFrameId that is not the frame directly below", () => {
    const state = raw("effect-window-with-parent-chain");
    (state.effectStack[1].effectDamage as { parentFrameId: string }).parentFrameId = "elsewhere";
    expectRejected(state, /effectStack\[1\]\.effectDamage\.parentFrameId names frame "elsewhere", which is not the frame directly below it/);
  });

  it("rejects a parent frame that is not a chain paused on DEAL_DAMAGE", () => {
    const state = raw("effect-window-with-parent-chain");
    state.effectStack[0] = { ...state.effectStack[0], pausedAction: { type: "DRAW", params: { amount: 1 } } };
    expectRejected(state, /parentFrameId names frame "v3-parent-chain", which is not an effect chain paused on DEAL_DAMAGE/);
  });

  it("rejects a frame carrying two continuation families", () => {
    const state = raw("battle-trigger-window");
    state.effectStack[0] = { ...state.effectStack[0], replacement: { effectId: "e", targetInstanceId: "t", event: "WOULD_BE_KO" } };
    expectRejected(state, /carries more than one continuation family: replacement, battleDamage/);
  });

  it("rejects a kind-phase disagreement on a damage frame", () => {
    const state = raw("battle-trigger-window");
    state.effectStack[0] = { ...state.effectStack[0], phase: "INTERRUPTED_BY_TRIGGERS" };
    expectRejected(state, /is BATTLE_DAMAGE at stage TRIGGER_WINDOW but has phase INTERRUPTED_BY_TRIGGERS; expected AWAITING_TRIGGER_REVEAL/);
  });

  it("rejects a REPLACEMENT frame at a phase other than AWAITING_OPTIONAL_RESPONSE", () => {
    const state = raw("replacement-prompt");
    state.effectStack[0] = { ...state.effectStack[0], phase: "AWAITING_PLAYER_CHOICE" };
    expectRejected(state, /is REPLACEMENT but has phase AWAITING_PLAYER_CHOICE/);
  });

  it("rejects a batch offer whose current match does not exist", () => {
    const state = raw("replacement-batch-prompt");
    (state.effectStack[0].replacementBatch as { currentMatchIndex: number }).currentMatchIndex = 5;
    expectRejected(state, /has replacementBatch\.currentMatchIndex 5 past its 1 pending match\(es\)/);
  });

  it("rejects an explicit kind that disagrees with a damage frame's content", () => {
    const state = raw("battle-trigger-window");
    state.effectStack[0] = { ...state.effectStack[0], kind: "EFFECT" };
    expectRejected(state, /declares kind EFFECT but its content is BATTLE_DAMAGE/);
  });

  it("rejects an unknown damage stage at strict validation", () => {
    const state = raw("battle-trigger-window");
    (state.effectStack[0].battleDamage as { stage: string }).stage = "LIFE_REMOVAL";
    expectRejected(state, /invalid core shape at effectStack\.0\.battleDamage/);
  });

  it.each([
    ["battleDamage", (frame: Record<string, unknown>) => { frame.battleDamage = { stage: "TRIGGER_WINDOW", battleId: "b", damagedPlayerIndex: 1, lifeCard: { instanceId: "l", cardId: "c", face: "DOWN" } }; }, /carries battleDamage, which no version 2 writer wrote/],
    ["AWAITING_TRIGGER_REVEAL", (frame: Record<string, unknown>) => { frame.phase = "AWAITING_TRIGGER_REVEAL"; }, /has phase AWAITING_TRIGGER_REVEAL, which no version 2 writer wrote/],
  ] as const)("rejects a version 2 object carrying %s, naming the undo entry and touching nothing", async (_key, edit, message) => {
    const v2 = JSON.parse(JSON.stringify(toPersistedGameState(goldenV2State("effect-frame-prompt")))) as Raw;
    edit(v2.effectStack[0]);
    const storage = storageWith(golden("battle-ready-with-undo").session.state, [v2]);
    const before = JSON.stringify([...storage.data.entries()]);
    await expect(repository(storage).load()).rejects.toMatchObject({
      name: "SessionLoadError",
      location: "undoHistory[0]",
      message: expect.stringMatching(message),
    });
    expect(JSON.stringify([...storage.data.entries()])).toBe(before);
    expect(storage.writes).toEqual([]);
  });
});

// ─── OPT-963 PR #757 fix round 1 ─────────────────────────────────────────────

interface WrittenCase { source: string; state: Record<string, unknown>; cardDb: Record<string, CardData> }
/** Version 3 states the PR 5b engine (8823ad05) wrote while running its own suite (review corpus). */
function writtenBy5b(name: string): { state: GameState; cardDb: Map<string, CardData>; raw: Record<string, unknown> } {
  const file = corpus as unknown as { cases: Record<string, WrittenCase> };
  const entry = file.cases[name];
  if (!entry) throw new Error(`no 5b-written case named ${name}`);
  const raw = JSON.parse(JSON.stringify(entry.state)) as Record<string, unknown>;
  return { state: convertPersistedGameState(JSON.parse(JSON.stringify(entry.state)), "state"), cardDb: new Map(Object.entries(entry.cardDb)), raw };
}

/** Life card identities a REVEAL_TRIGGER prompt must not show to `responder`. */
function foreignLifeIdentities(state: GameState, responder: 0 | 1): Set<string> {
  const other = responder === 0 ? 1 : 0;
  const ids = new Set(state.players[other].life.map((card) => card.instanceId));
  const defender = state.turn.activePlayerIndex === 0 ? 1 : 0;
  const battleCard = state.turn.battle?.pendingTriggerLifeCard;
  if (battleCard && defender !== responder) ids.add(battleCard.instanceId);
  const effect = state.turn.pendingTriggerFromEffect;
  if (effect && effect.damagedPlayerIndex !== responder) ids.add(effect.lifeCard.instanceId);
  return ids;
}

function expectRevealPromptOwned(state: GameState) {
  const prompt = state.pendingPrompt;
  if (!prompt) return;
  const options = prompt.options;
  if (options.promptType !== "REVEAL_TRIGGER") return;
  const foreign = foreignLifeIdentities(state, prompt.respondingPlayer);
  for (const card of options.cards) {
    expect(card.controller).toBe(prompt.respondingPlayer);
    expect(card.owner).toBe(prompt.respondingPlayer);
    expect(foreign.has(card.instanceId)).toBe(false);
  }
}

describe("OPT-963 fix round 1: lowering resumes what the 5b engine wrote", () => {
  it("F1: a batch waiting below a substitute's prompt frames rides on the top frame and resumes on the version 2 engine (5b-written)", () => {
    const { state, cardDb } = writtenBy5b("nested-batch-below-substitute-prompt");
    expect(state.effectStack.map((frame) => frame.phase)).toEqual(["INTERRUPTED_BY_TRIGGERS", "AWAITING_BATCH_RESUME", "AWAITING_OPTIONAL_RESPONSE"]);
    expect(state.effectStack.at(-1)?.replacementBatchContinuation).toBeDefined();
    expect(state.effectStack.at(-2)?.replacementBatchContinuation).toBeUndefined();
    for (const answer of [{ type: "PASS" as const }, { type: "PLAYER_CHOICE" as const, choiceId: "accept" }]) {
      const done = reply(state, cardDb, 1, answer);
      expect(done.rejected, JSON.stringify(done.routed)).toBe(false);
      // The nested substitute rested char-1-v1 instead of K.O.ing it; the batch then K.O.s char-1-b1.
      const chars = done.state.players[1].characters.filter(Boolean).map((card) => `${card!.instanceId}/${card!.state}`);
      expect(chars).toEqual(["char-1-v1/RESTED"]);
      expect(done.state.players[1].trash).toHaveLength(1);
      expect(done.state.pendingPrompt).toBeNull();
    }
  });

  it("C1: events retained on an effect TRIGGER_EFFECT frame reach the log once through the Trigger's frame (5b-written)", () => {
    const { state, cardDb, raw } = writtenBy5b("effect-trigger-effect-retained-events");
    const written = (raw.effectStack as Array<{ effectDamage?: unknown; accumulatedEvents: Array<{ type: string }> }>).find((frame) => frame.effectDamage)!;
    expect(written.accumulatedEvents.map((event) => event.type)).toEqual(["TRIGGER_ACTIVATED", "CARD_REMOVED_FROM_LIFE"]);
    const top = state.effectStack.at(-1)!;
    expect(top.phase).toBe("AWAITING_TARGET_SELECTION");
    expect(top.accumulatedEvents.map((event) => event.type)).toEqual(["TRIGGER_ACTIVATED", "CARD_REMOVED_FROM_LIFE"]);
    let current = reply(state, cardDb, 1, { type: "SELECT_TARGET", selectedInstanceIds: ["char-0-v1"] });
    expect(current.rejected, JSON.stringify(current.routed)).toBe(false);
    for (let guard = 0; guard < 4 && current.state.pendingPrompt; guard += 1) {
      const pending = current.state.pendingPrompt;
      const next = pending.options.promptType === "SELECT_TARGET"
        ? { type: "SELECT_TARGET" as const, selectedInstanceIds: (pending.options as { validTargets: string[] }).validTargets.slice(0, 1), promptId: pending.promptId }
        : { type: "PASS" as const, promptId: pending.promptId };
      current = reply(current.state, cardDb, pending.respondingPlayer, next);
      expect(current.rejected).toBe(false);
    }
    expect(current.state.pendingPrompt).toBeNull();
    expect(current.state.effectStack).toEqual([]);
    const log = current.state.eventLog;
    const removalOf = (id: string) => log.filter((event) => event.type === "CARD_REMOVED_FROM_LIFE" && (event.payload as { cardInstanceId?: string }).cardInstanceId === id);
    // The retained point events: the Trigger's Life card removal and its activation, once each.
    expect(removalOf("p1-life-ko")).toHaveLength(1);
    expect(log.filter((event) => event.type === "TRIGGER_ACTIVATED" && (event.payload as { activated?: boolean }).activated === true)).toHaveLength(1);
    // The parent chain's own retained events, then its suffix (OP06-116's THEN: LIFE_TO_HAND on p0).
    expect(log.filter((event) => event.type === "LIFE_COUNT_BECOMES_ZERO")).toHaveLength(1);
    expect(log.filter((event) => event.type === "CARD_KO")).toHaveLength(1);
    expect(log.filter((event) => event.type === "CARD_ADDED_TO_HAND_FROM_LIFE")).toHaveLength(1);
    expect(removalOf("p0-life-a")).toHaveLength(1);
    expect(log.filter((event) => event.type === "CARD_REMOVED_FROM_LIFE")).toHaveLength(2);
    expect(current.state.players[0].life).toHaveLength(1);
    expect(current.state.players[0].hand).toHaveLength(6);
    const types = log.map((event) => event.type);
    expect(types.indexOf("TRIGGER_ACTIVATED")).toBeLessThan(types.indexOf("CARD_KO"));
    expect(types.indexOf("CARD_KO")).toBeLessThan(types.indexOf("CARD_ADDED_TO_HAND_FROM_LIFE"));
  });

  it("no lowered REVEAL_TRIGGER prompt shows a Life card of a player other than its responder (every fixture, golden and 5b-written state)", () => {
    for (const entry of STATES) expectRevealPromptOwned(convertPersistedGameState(persistedV3(entry.state), "state"));
    for (const name of ["battle-trigger-window", "effect-damage-trigger-window", "both-trigger-windows"]) expectRevealPromptOwned(goldenV2State(name));
    for (const name of ["nested-batch-below-substitute-prompt", "effect-trigger-effect-retained-events", "both-trigger-windows"]) expectRevealPromptOwned(writtenBy5b(name).state);
  });

  it("F4: CHARACTER_KO_REPLACEMENT keeps replacementEffectId and resolution through lowering", () => {
    const loaded = convertPersistedGameState(persistedV3(byName("battle-ko-replacement-fields").state), "state");
    expect(loaded.turn.pendingBattleDamageContinuation).toMatchObject({ stage: "CHARACTER_KO_REPLACEMENT", replacementEffectId: "ko-replacement-effect", resolution: "REPLACED" });
  });
});

describe("OPT-963 fix round 1: rejections", () => {
  type Raw = Record<string, unknown> & { effectStack: Array<Record<string, unknown>>; pendingPrompt: Record<string, unknown> | null; turn: Record<string, unknown> };
  const raw = (name: string): Raw => persistedV3(byName(name).state) as Raw;
  const expectRejected = (state: Raw, message: string | RegExp) => expect(() => convertPersistedGameState(state, "state")).toThrow(message);

  it("F5: a REPLACEMENT frame owns only its OPTIONAL_EFFECT offer (a SELECT_TARGET prompt naming it is rejected)", () => {
    const state = raw("replacement-prompt");
    state.pendingPrompt = { ...state.pendingPrompt!, options: { promptType: "SELECT_TARGET", cards: [], validTargets: [], effectDescription: "x", countMin: 0, countMax: 0, ctaLabel: "c" } };
    expectRejected(state, /names REPLACEMENT frame "v3-replacement" for a SELECT_TARGET prompt; a replacement frame owns only its OPTIONAL_EFFECT offer/);
  });

  it("F6a: a non-damage frame at AWAITING_TRIGGER_REVEAL is rejected (no engine path writes it)", () => {
    const state = raw("battle-trigger-window");
    const { battleDamage: _dropped, ...plain } = state.effectStack[0];
    state.effectStack = [plain];
    state.pendingPrompt = null;
    expectRejected(state, /effectStack\[0\] \(frame "v3-battle-damage"\) is EFFECT but has phase AWAITING_TRIGGER_REVEAL; only a damage frame at TRIGGER_WINDOW waits for a reveal/);
  });

  it("F6b: a REPLACEMENT_BATCH frame offering a match that no prompt names is rejected (0 of the 4 committed engine-written states)", () => {
    const state = raw("replacement-batch-prompt");
    state.pendingPrompt = null;
    expectRejected(state, /effectStack\[0\] \(frame "v3-replacement-batch"\) is a REPLACEMENT_BATCH frame offering a match, but pendingPrompt does not name it/);
  });

  it.each([
    ["turn.pendingTriggerFromEffect", (state: Raw) => { state.turn.pendingTriggerFromEffect = byName("effect-damage-trigger-window").lowered.turn.pendingTriggerFromEffect; }],
    ["turn.pendingBattleDamageContinuation", (state: Raw) => { state.turn.pendingBattleDamageContinuation = byName("stuck-damage-step").lowered.turn.pendingBattleDamageContinuation; }],
    ["turn.battle.pendingTriggerLifeCard", (state: Raw) => { state.turn.battle = { ...(byName("battle-trigger-window").lowered.turn.battle as object), pendingTriggerLifeCard: { instanceId: "l", cardId: "c", face: "DOWN" } }; }],
    ["effectStack[0].replacementBatchContinuation", (state: Raw) => { state.effectStack[0] = { ...state.effectStack[0], replacementBatchContinuation: byName("replacement-batch-prompt").lowered.pendingPrompt!.resumeContext }; }],
    ["pendingPrompt.resumeContext of type REPLACEMENT", (state: Raw) => { state.pendingPrompt = { ...state.pendingPrompt!, resumeContext: { type: "REPLACEMENT", effectId: "e", targetInstanceId: "t", event: "WOULD_BE_KO" } }; }],
  ])("F6c: a version 3 object also carrying %s is rejected by name", (field, edit) => {
    const state = raw("effect-window-with-parent-chain");
    edit(state);
    expectRejected(state, new RegExp(`is schemaVersion 3 but carries ${field.replace(/[.[\]]/g, "\\$&")}, a version 2 record the version 3 writer lifts into a frame`));
  });
});
