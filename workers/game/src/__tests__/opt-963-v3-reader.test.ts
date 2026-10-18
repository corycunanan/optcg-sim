/**
 * OPT-963 (PR 5b): the version 3 runtime and writer, the v2 → v3 lift of
 * every replacement and damage record (live and undo), reference integrity
 * for the new kinds, mixed-version undo, and the retired version 2 records.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §1.8, §2, §8.
 * Fixtures: `fixtures/opt-963-v3-states.ts` (SYNTHETIC: version 2 goldens
 * lifted by the real reader, plus constructed version 3 shapes).
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
  EFFECT_STACK_FRAME_KINDS,
  GAME_STATE_SCHEMA_VERSION,
  GAME_STATE_SCHEMA_VERSION_KEY,
  LATEST_READABLE_GAME_STATE_SCHEMA_VERSION,
  RUNTIME_GAME_STATE_SCHEMA_VERSION,
  SUPPORTED_GAME_STATE_SCHEMA_VERSIONS,
  classifyLegacyShapes,
  frameKindOf,
  isStuckDamageStep,
  toPersistedGameState,
} from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { loadGoldenFixture } from "./fixtures/opt-940-golden.js";
import {
  LIFTED_GOLDEN_CASES,
  buildV3SyntheticStates,
  goldenV1Raw,
  goldenV2Raw,
  liftedGolden,
  persistedV3,
} from "./fixtures/opt-963-v3-states.js";
import { battleTriggerLifeCard, effectTriggerWindow } from "./trigger-window-helpers.js";

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

function withoutVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  return rest;
}

const kindsOf = (state: GameState) => state.effectStack.map(frameKindOf);

describe("OPT-963 version 3 runtime and writer (PR 5b)", () => {
  it("reads 1, 2 and 3, executes 3, and writes 3", () => {
    expect([...SUPPORTED_GAME_STATE_SCHEMA_VERSIONS]).toEqual([1, 2, 3]);
    expect(LATEST_READABLE_GAME_STATE_SCHEMA_VERSION).toBe(3);
    expect(RUNTIME_GAME_STATE_SCHEMA_VERSION).toBe(3);
    expect(GAME_STATE_SCHEMA_VERSION).toBe(3);
    expect([...EFFECT_STACK_FRAME_KINDS]).toEqual(
      expect.arrayContaining(["REPLACEMENT", "REPLACEMENT_BATCH", "BATTLE_DAMAGE", "EFFECT_DAMAGE"])
    );
  });

  it("derives the four kinds from their one field, before the phase", () => {
    expect(kindsOf(liftedGolden("battle-trigger-window"))).toEqual(["BATTLE_DAMAGE"]);
    expect(kindsOf(liftedGolden("effect-damage-trigger-window"))).toEqual(["EFFECT_DAMAGE"]);
    expect(kindsOf(liftedGolden("replacement-prompt"))).toEqual(["REPLACEMENT"]);
    const batch = liftedGolden("replacement-batch-prompt").effectStack[0];
    expect(frameKindOf(batch)).toBe("REPLACEMENT_BATCH");
    expect(frameKindOf({ ...batch, phase: "INTERRUPTED_BY_TRIGGERS" })).toBe("REPLACEMENT_BATCH");
  });
});

describe("OPT-963 v2 → v3 lift: every version 2 record becomes a frame, live and as undo", () => {
  it("battle Trigger window: battle.pendingTriggerLifeCard becomes a BATTLE_DAMAGE frame that owns the prompt", () => {
    const raw = goldenV2Raw("battle-trigger-window");
    const state = liftedGolden("battle-trigger-window");
    expect(kindsOf(state)).toEqual(["BATTLE_DAMAGE"]);
    const frame = state.effectStack[0];
    expect(frame.phase).toBe("AWAITING_TRIGGER_REVEAL");
    expect(battleTriggerLifeCard(state)).toEqual((raw.turn as { battle: { pendingTriggerLifeCard: unknown } }).battle.pendingTriggerLifeCard);
    expect(state.turn.battle).not.toHaveProperty("pendingTriggerLifeCard");
    expect(state.pendingPrompt?.resumeContext).toBe(frame.id);
    expect(state.pendingPrompt?.respondingPlayer).toBe(1);
  });

  it("effect Trigger window: turn.pendingTriggerFromEffect becomes an EFFECT_DAMAGE frame with no parent (the chain already ran on)", () => {
    const raw = goldenV2Raw("effect-damage-trigger-window");
    const state = liftedGolden("effect-damage-trigger-window");
    expect(kindsOf(state)).toEqual(["EFFECT_DAMAGE"]);
    const window = effectTriggerWindow(state)!;
    const record = raw.turn as { pendingTriggerFromEffect: Record<string, unknown> };
    expect(window).toEqual({ stage: "TRIGGER_WINDOW", dealt: 0, ...record.pendingTriggerFromEffect });
    expect(window.parentFrameId).toBeUndefined();
    expect(state.turn).not.toHaveProperty("pendingTriggerFromEffect");
    expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[0].id);
  });

  it("both windows: the two records nest (battle below, effect above) and the prompt moves to the inner window's responder", () => {
    const state = liftedGolden("both-trigger-windows");
    expect(kindsOf(state)).toEqual(["BATTLE_DAMAGE", "EFFECT_DAMAGE"]);
    expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[1].id);
    expect(state.pendingPrompt?.respondingPlayer).toBe(0);
    expect(classifyLegacyShapes(state)).toEqual([]);
  });

  it("both windows: both replies resolve through the coordinator and the battle ends (OPT-974 recovered)", () => {
    const entry = golden("both-trigger-windows");
    const cardDb = new Map(Object.entries(entry.cardDb)) as Map<string, never>;
    let state = liftedGolden("both-trigger-windows");
    const coordinator = new SessionCoordinator();
    const answer = (player: 0 | 1) => {
      const prompt = state.pendingPrompt!;
      expect(prompt.options.promptType).toBe("REVEAL_TRIGGER");
      expect(prompt.respondingPlayer).toBe(player);
      const action = { type: "REVEAL_TRIGGER" as const, reveal: false, promptId: prompt.promptId };
      const routed = coordinator.executeAction(state, [], player, action, cardDb);
      expect(routed.kind).toBe("resume");
      const resumed = resumePromptLifecycle(routed.state, action, cardDb, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(resumed.responseRejected).toBe(false);
      state = coordinator.surfaceRevealTrigger(resumed.state, cardDb);
    };
    answer(0);
    answer(1);
    expect(state.pendingPrompt).toBeNull();
    expect(state.effectStack).toEqual([]);
    expect(state.turn.battle).toBeNull();
    expect(state.status).toBe("IN_PROGRESS");
  });

  it("replacement offer: the REPLACEMENT context becomes a REPLACEMENT frame on top that owns the prompt", () => {
    const raw = goldenV2Raw("replacement-prompt");
    const state = liftedGolden("replacement-prompt");
    const context = (raw.pendingPrompt as { resumeContext: Record<string, unknown> }).resumeContext;
    expect(kindsOf(state)).toEqual(["REPLACEMENT"]);
    expect(state.effectStack[0].replacement).toEqual({
      effectId: context.effectId,
      targetInstanceId: context.targetInstanceId,
      event: context.event,
    });
    expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[0].id);
  });

  it("replacement batch offer: the REPLACEMENT_BATCH context becomes a REPLACEMENT_BATCH frame on top", () => {
    const raw = goldenV2Raw("replacement-batch-prompt");
    const state = liftedGolden("replacement-batch-prompt");
    const { type: _type, ...batch } = (raw.pendingPrompt as { resumeContext: Record<string, unknown> }).resumeContext;
    expect(kindsOf(state)).toEqual(["REPLACEMENT_BATCH"]);
    expect(state.effectStack[0].replacementBatch).toEqual(batch);
    expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[0].id);
  });

  it("stuck Damage Step (OPT-884): the K.O. replacement record becomes a BATTLE_DAMAGE frame and keeps its classification", () => {
    const state = liftedGolden("stuck-damage-step");
    expect(kindsOf(state)).toEqual(["BATTLE_DAMAGE"]);
    expect(state.effectStack[0].battleDamage).toMatchObject({ stage: "CHARACTER_KO_REPLACEMENT", targetInstanceId: "char-1-gone" });
    expect(isStuckDamageStep(state)).toBe(true);
    expect(classifyLegacyShapes(state)).toEqual([{ shape: "legacy.stuck_damage_step" }]);
  });

  it("LIFE_REMOVAL and DAMAGE continuations become TRIGGER_EFFECT with the removal retained unscanned or not", () => {
    const base = goldenV2Raw("battle-trigger-window") as Record<string, unknown> & { turn: Record<string, unknown> & { battle: Record<string, unknown> } };
    for (const stage of ["LIFE_REMOVAL", "DAMAGE"] as const) {
      const { pendingTriggerLifeCard: _card, ...battle } = base.turn.battle;
      const raw = {
        ...base,
        turn: {
          ...base.turn,
          battle,
          pendingBattleDamageContinuation: { battleId: battle.battleId, lifeCardInstanceId: "life-x", damagedPlayerIndex: 1, stage },
        },
        pendingPrompt: null,
      };
      const state = convertPersistedGameState(raw, "state");
      expect(kindsOf(state)).toEqual(["BATTLE_DAMAGE"]);
      expect(state.effectStack[0].phase).toBe("INTERRUPTED_BY_TRIGGERS");
      expect(state.effectStack[0].battleDamage).toEqual({ stage: "TRIGGER_EFFECT", battleId: battle.battleId, damagedPlayerIndex: 1, lifeCardInstanceId: "life-x" });
      expect(state.effectStack[0].accumulatedEvents).toHaveLength(stage === "LIFE_REMOVAL" ? 1 : 0);
    }
  });

  it("a frame's replacementBatchContinuation rider becomes a REPLACEMENT_BATCH frame directly below it", () => {
    const raw = goldenV2Raw("effect-frame-prompt") as Record<string, unknown> & { effectStack: Array<Record<string, unknown>> };
    const rider = (goldenV2Raw("replacement-batch-prompt").pendingPrompt as { resumeContext: Record<string, unknown> }).resumeContext;
    raw.effectStack = [{ ...raw.effectStack[0], replacementBatchContinuation: rider }];
    const state = convertPersistedGameState(raw, "state");
    expect(kindsOf(state)).toEqual(["REPLACEMENT_BATCH", "EFFECT"]);
    expect(state.effectStack[0].phase).toBe("INTERRUPTED_BY_TRIGGERS");
    expect(state.effectStack[1]).not.toHaveProperty("replacementBatchContinuation");
    expect(state.pendingPrompt?.resumeContext).toBe(state.effectStack[1].id);
  });

  it.each([...LIFTED_GOLDEN_CASES])("%s lifts identically live, as a version 1 object and as an undo snapshot", async (name) => {
    const live = liftedGolden(name);
    expect(convertPersistedGameState(goldenV1Raw(name), "state")).toEqual(live);
    const loaded = (await repository(storageWith(golden("battle-ready-with-undo").session.state, [goldenV2Raw(name)])).load())!;
    expect(loaded.undoHistory[0]).toEqual(live);
  });
});

describe("OPT-963 v3 reader: every version 3 shape loads unchanged, live and as undo", () => {
  it.each(NAMES)("%s loads live with nothing dropped", (name) => {
    const raw = persistedV3(byName(name).state);
    const loaded = convertPersistedGameState(raw, "state");
    expect(loaded).toEqual(withoutVersion(raw));
    expect(loaded).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
  });

  it.each(NAMES)("%s loads as an undo snapshot through the same hook", async (name) => {
    const raw = persistedV3(byName(name).state);
    const loaded = (await repository(storageWith(golden("battle-ready-with-undo").session.state, [raw])).load())!;
    expect(loaded.undoHistory[0]).toEqual(withoutVersion(raw));
  });

  it.each(NAMES)("%s round-trips through the writer as version 3", (name) => {
    const state = runtime(byName(name).state);
    const out = toPersistedGameState(state) as unknown as Record<string, unknown>;
    expect(Object.keys(out)[0]).toBe(GAME_STATE_SCHEMA_VERSION_KEY);
    expect(out[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(3);
    expect(convertPersistedGameState(JSON.parse(JSON.stringify(out)), "state")).toEqual(state);
  });
});

describe("OPT-963 mixed-version undo history", () => {
  it("[3, 2]: a version 3 live state with a version 2 undo snapshot loads, both as version 3, and re-saves as version 3", async () => {
    const entry = golden("battle-trigger-window");
    const storage = storageWith(persistedV3(byName("battle-trigger-window").state), [goldenV2Raw("effect-damage-trigger-window")], entry.cardDb);
    const first = (await repository(storage).load())!;
    expect(kindsOf(first.state)).toEqual(["BATTLE_DAMAGE"]);
    expect(kindsOf(first.undoHistory[0])).toEqual(["EFFECT_DAMAGE"]);
    const target = new MemorySessionStorage();
    const saved = await repository(target).save(first);
    const written = target.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
    expect(written.state[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(3);
    const writtenUndo = target.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as Record<string, unknown>[];
    expect(writtenUndo[0][GAME_STATE_SCHEMA_VERSION_KEY]).toBe(3);
    const second = (await repository(target).load())!;
    expect(second.state).toEqual(saved.state);
    expect(second.undoHistory).toEqual(saved.undoHistory);
  });

  it("[2, 3]: a version 2 live state with a version 3 undo snapshot loads", async () => {
    const live = goldenV2Raw("replacement-prompt");
    const undo = persistedV3(byName("effect-window-with-parent-chain").state);
    const loaded = (await repository(storageWith(live, [undo], golden("replacement-prompt").cardDb)).load())!;
    expect(kindsOf(loaded.state)).toEqual(["REPLACEMENT"]);
    expect(loaded.undoHistory[0]).toEqual(withoutVersion(undo));
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
  const battleId = () => raw("battle-trigger-window").effectStack[0].id as string;
  const replacementId = () => raw("replacement-prompt").effectStack[0].id as string;

  it("rejects a REVEAL_TRIGGER prompt naming a frame that is not a damage frame", () => {
    const state = raw("battle-trigger-window");
    state.effectStack[0] = { ...state.effectStack[0], battleDamage: undefined, phase: "AWAITING_TARGET_SELECTION" };
    expectRejected(state, new RegExp(`pendingPrompt\\.resumeContext names frame "${battleId()}" of kind EFFECT for a REVEAL_TRIGGER prompt; only a damage frame owns one`));
  });

  it("rejects an OPTIONAL_EFFECT prompt naming a damage frame", () => {
    const state = raw("replacement-prompt");
    const battle = raw("battle-trigger-window").effectStack[0];
    state.effectStack = [{ ...battle, id: replacementId() }];
    expectRejected(state, /names BATTLE_DAMAGE frame "[^"]+" for a OPTIONAL_EFFECT prompt/);
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
    expectRejected(state, /names REPLACEMENT frame "[^"]+", which is not the top frame/);
  });

  it("rejects a REPLACEMENT frame that no prompt names", () => {
    const state = raw("replacement-prompt");
    state.pendingPrompt = null;
    expectRejected(state, /effectStack\[0\] \(frame "[^"]+"\) is a REPLACEMENT frame waiting for an answer, but pendingPrompt does not name it/);
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

  it("rejects a version 3 object carrying an executable replacement prompt context", () => {
    const state = raw("replacement-prompt");
    state.effectStack = [];
    state.pendingPrompt = { ...state.pendingPrompt!, resumeContext: { type: "REPLACEMENT", effectId: "e", targetInstanceId: "t", event: "WOULD_BE_KO" } };
    expectRejected(state, /pendingPrompt\.resumeContext is an executable REPLACEMENT context; from version 3 a replacement prompt names its frame/);
  });

  it.each([
    ["turn.pendingTriggerFromEffect", (state: Raw) => { state.turn.pendingTriggerFromEffect = { lifeCard: { instanceId: "l", cardId: "c", face: "DOWN" }, damagedPlayerIndex: 1, remainingDamages: 0, sourceCardInstanceId: "s", controllerIndex: 0 }; }],
    ["turn.pendingBattleDamageContinuation", (state: Raw) => { state.turn.pendingBattleDamageContinuation = { battleId: "b", stage: "CHARACTER_KO_REPLACEMENT", targetInstanceId: "t", causingPlayerIndex: 0, attackerIsCharacter: true }; }],
    ["turn.battle.pendingTriggerLifeCard", (state: Raw) => { state.turn.battle = { ...(raw("battle-trigger-window").turn.battle as object), pendingTriggerLifeCard: { instanceId: "l", cardId: "c", face: "DOWN" } }; }],
    ["effectStack[0].replacementBatchContinuation", (state: Raw) => { state.effectStack[0] = { ...state.effectStack[0], replacementBatchContinuation: { type: "REPLACEMENT_BATCH", actionKind: "KO", event: "WOULD_BE_KO", allTargetIds: [], protectedIds: [], pendingMatches: [], currentMatchIndex: 0, causingController: 0 } }; }],
  ] as const)("rejects a version 3 object carrying the retired record %s, by name (the version 3 writer lifts it into a frame)", (field, edit) => {
    const state = raw("effect-window-with-parent-chain");
    edit(state);
    expectRejected(state, new RegExp(`is schemaVersion 3 but carries ${field.replace(/[.[\]]/g, "\\$&")}, a version 2 record the version 3 writer lifts into a frame`));
  });

  it("F5: a REPLACEMENT frame owns only its OPTIONAL_EFFECT offer (a SELECT_TARGET prompt naming it is rejected)", () => {
    const state = raw("replacement-prompt");
    state.pendingPrompt = { ...state.pendingPrompt!, options: { promptType: "SELECT_TARGET", cards: [], validTargets: [], effectDescription: "x", countMin: 0, countMax: 0, ctaLabel: "c" } };
    expectRejected(state, new RegExp(`names REPLACEMENT frame "${replacementId()}" for a SELECT_TARGET prompt; a replacement frame owns only its OPTIONAL_EFFECT offer`));
  });

  it("F6a: a non-damage frame at AWAITING_TRIGGER_REVEAL is rejected (only openBattleTriggerWindow and continueEffectDamageSequence write the phase)", () => {
    const state = raw("battle-trigger-window");
    const { battleDamage: _dropped, ...plain } = state.effectStack[0];
    state.effectStack = [plain];
    state.pendingPrompt = null;
    expectRejected(state, new RegExp(`effectStack\\[0\\] \\(frame "${battleId()}"\\) is EFFECT but has phase AWAITING_TRIGGER_REVEAL; only a damage frame at TRIGGER_WINDOW waits for a reveal`));
  });

  it("F6b: a REPLACEMENT_BATCH frame offering a match that no prompt names is rejected (0 of 286 engine-written states)", () => {
    const state = raw("replacement-batch-prompt");
    const id = state.effectStack[0].id as string;
    state.pendingPrompt = null;
    expectRejected(state, new RegExp(`effectStack\\[0\\] \\(frame "${id}"\\) is a REPLACEMENT_BATCH frame offering a match, but pendingPrompt does not name it`));
  });

  it.each([
    ["battleDamage", (frame: Record<string, unknown>) => { frame.battleDamage = { stage: "TRIGGER_WINDOW", battleId: "b", damagedPlayerIndex: 1, lifeCard: { instanceId: "l", cardId: "c", face: "DOWN" } }; }, /carries battleDamage, which no version 2 writer wrote/],
    ["AWAITING_TRIGGER_REVEAL", (frame: Record<string, unknown>) => { frame.phase = "AWAITING_TRIGGER_REVEAL"; }, /has phase AWAITING_TRIGGER_REVEAL, which no version 2 writer wrote/],
  ] as const)("rejects a version 2 object carrying %s, naming the undo entry and touching nothing", async (_key, edit, message) => {
    const v2 = goldenV2Raw("effect-frame-prompt") as Raw;
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
