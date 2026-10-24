/**
 * OPT-963 (PR 5b): the version 3 runtime and writer, the v2 → v3 lift of
 * every replacement and damage record (live and undo), reference integrity
 * for the new kinds, mixed-version undo, and the retired version 2 records.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §1.8, §2, §8.
 * Fixtures: `fixtures/opt-963-v3-states.ts` (SYNTHETIC: version 2 goldens
 * lifted by the real reader, plus constructed version 3 shapes).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CardData, GameState, PendingPromptState } from "../types.js";
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
  return JSON.parse(JSON.stringify({ ...state, effectStack: state.effectStack.map(({ kind: _kind, ...frame }) => frame) })) as GameState;
}

function withoutVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...raw };
  delete rest[GAME_STATE_SCHEMA_VERSION_KEY];
  return rest;
}

const kindsOf = (state: GameState) => state.effectStack.map(frameKindOf);

describe("OPT-963 version 3 runtime and writer (PR 5b)", () => {
  it("reads 1–9, executes native 8 and normally writes 8", () => {
    expect([...SUPPORTED_GAME_STATE_SCHEMA_VERSIONS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LATEST_READABLE_GAME_STATE_SCHEMA_VERSION).toBe(9);
    expect(RUNTIME_GAME_STATE_SCHEMA_VERSION).toBe(8);
    expect(GAME_STATE_SCHEMA_VERSION).toBe(8);
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
      // The card shown is the answering player's own window card (PR #758 L5).
      const owner = state.effectStack.find((frame) => frame.id === prompt.resumeContext)!;
      const window = owner.battleDamage?.stage === "TRIGGER_WINDOW" ? owner.battleDamage : owner.effectDamage?.stage === "TRIGGER_WINDOW" ? owner.effectDamage : null;
      expect(window?.damagedPlayerIndex).toBe(player);
      expect(prompt.options.promptType === "REVEAL_TRIGGER" ? prompt.options.cards.map((card) => [card.instanceId, card.controller, card.owner]) : []).toEqual([[window!.lifeCard.instanceId, player, player]]);
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
    expect(loaded.undoHistory[0]).toEqual(toPersistedGameState({ ...live, schemaVersion: 8, costSemanticsVersion: 7 }));
  });
});

describe("OPT-963 v3 reader: every version 3 shape loads unchanged, live and as undo", () => {
  it.each(NAMES)("%s loads live with nothing dropped", (name) => {
    const raw = persistedV3(byName(name).state);
    const loaded = convertPersistedGameState(raw, "state");
    expect(withoutVersion(persistedV3(loaded))).toEqual(withoutVersion(raw));
    expect(loaded).not.toHaveProperty(GAME_STATE_SCHEMA_VERSION_KEY);
  });

  it.each(NAMES)("%s loads as an undo snapshot through the same hook", async (name) => {
    const raw = persistedV3(byName(name).state);
    const loaded = (await repository(storageWith(golden("battle-ready-with-undo").session.state, [raw])).load())!;
    expect(withoutVersion(persistedV3(loaded.undoHistory[0]))).toEqual(withoutVersion(raw));
  });

  it.each(NAMES)("%s round-trips historical semantics through the version 8 writer", (name) => {
    const state = runtime(byName(name).state);
    const out = toPersistedGameState(state) as unknown as Record<string, unknown>;
    expect(Object.keys(out)[0]).toBe(GAME_STATE_SCHEMA_VERSION_KEY);
    expect(out[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(8);
    expect(out.costSemanticsVersion).toBe(6);
    expect(persistedV3(convertPersistedGameState(JSON.parse(JSON.stringify(out)), "state"))).toEqual(persistedV3(state));
  });
});

describe("OPT-963 mixed-version undo history", () => {
  it("[3, 2]: a version 3 live state with a version 2 undo snapshot loads and re-saves both as version 8", async () => {
    const entry = golden("battle-trigger-window");
    const storage = storageWith(persistedV3(byName("battle-trigger-window").state), [goldenV2Raw("effect-damage-trigger-window")], entry.cardDb);
    const first = (await repository(storage).load())!;
    expect(kindsOf(first.state)).toEqual(["BATTLE_DAMAGE"]);
    expect(kindsOf(first.undoHistory[0])).toEqual(["EFFECT_DAMAGE"]);
    const target = new MemorySessionStorage();
    const saved = await repository(target).save(first);
    const written = target.data.get(SESSION_STORAGE_KEY) as { state: Record<string, unknown> };
    expect(written.state[GAME_STATE_SCHEMA_VERSION_KEY]).toBe(8);
    expect(written.state.costSemanticsVersion).toBe(7);
    const writtenUndo = target.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY) as Record<string, unknown>[];
    expect(writtenUndo[0][GAME_STATE_SCHEMA_VERSION_KEY]).toBe(8);
    expect(writtenUndo[0].costSemanticsVersion).toBe(7);
    const second = (await repository(target).load())!;
    expect(toPersistedGameState(second.state)).toEqual(toPersistedGameState(saved.state));
    expect(second.undoHistory.map(toPersistedGameState)).toEqual(saved.undoHistory.map(toPersistedGameState));
  });

  it("[2, 3]: a version 2 live state with a version 3 undo snapshot loads", async () => {
    const live = goldenV2Raw("replacement-prompt");
    const undo = persistedV3(byName("effect-window-with-parent-chain").state);
    const loaded = (await repository(storageWith(live, [undo], golden("replacement-prompt").cardDb)).load())!;
    expect(kindsOf(loaded.state)).toEqual(["REPLACEMENT"]);
    expect(withoutVersion(persistedV3(loaded.undoHistory[0]))).toEqual(withoutVersion(undo));
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

  it("accepts a same-shape self-damage parent in the v3 ingress", () => {
    const state = raw("effect-window-with-parent-chain");
    state.effectStack[0] = { ...state.effectStack[0], pausedAction: { type: "SELF_TAKE_DAMAGE", params: { amount: 1 } } };
    expect(() => convertPersistedGameState(state, "state")).not.toThrow();
  });

  it("rejects a parent frame that is not a chain paused on DEAL_DAMAGE", () => {
    const state = raw("effect-window-with-parent-chain");
    state.effectStack[0] = { ...state.effectStack[0], pausedAction: { type: "DRAW", params: { amount: 1 } } };
    expectRejected(state, /parentFrameId names frame "v3-parent-chain", which is not an effect chain paused on DEAL_DAMAGE or SELF_TAKE_DAMAGE/);
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

  it.each([
    ["REPLACEMENT", "replacement-prompt"],
    ["REPLACEMENT_BATCH", "replacement-batch-prompt"],
    ["BATTLE_DAMAGE", "battle-trigger-window"],
    ["EFFECT_DAMAGE", "effect-damage-trigger-window"],
  ] as const)("D-N3: a %s frame carrying remainingActions is rejected by name (no engine path writes one; the suffix lives on the continuation below)", (kind, fixture) => {
    const state = raw(fixture);
    const index = state.effectStack.findIndex((frame) => frameKindOf(frame as unknown as Parameters<typeof frameKindOf>[0]) === kind);
    expect(index).toBeGreaterThanOrEqual(0);
    const id = state.effectStack[index].id as string;
    state.effectStack[index] = { ...state.effectStack[index], remainingActions: [{ type: "DRAW", params: { amount: 1 } }] };
    expectRejected(state, new RegExp(`effectStack\\[${index}\\] \\(frame "${id}"\\) is ${kind} but carries 1 remainingActions; a continuation frame holds no chain suffix`));
  });

  it("F6a: a non-damage frame at AWAITING_TRIGGER_REVEAL is rejected (only openBattleTriggerWindow and continueEffectDamageSequence write the phase)", () => {
    const state = raw("battle-trigger-window");
    const { battleDamage: _dropped, ...plain } = state.effectStack[0];
    state.effectStack = [plain];
    state.pendingPrompt = null;
    expectRejected(state, new RegExp(`effectStack\\[0\\] \\(frame "${battleId()}"\\) is EFFECT but has phase AWAITING_TRIGGER_REVEAL; only a damage frame at TRIGGER_WINDOW waits for a reveal`));
  });

  it("F6b: a REPLACEMENT_BATCH frame offering a match that no prompt names is rejected (0 of the 4 committed engine-written states)", () => {
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

// ─── PR #758 fix round 1: L5 (lift prompt ownership) and the 5b-written corpus ─

interface WrittenCase { source: string; state: Record<string, unknown>; cardDb: Record<string, CardData> }
/** Version 3 states this engine (8823ad05) wrote while running its own suite, captured by the PR #757 review. */
function writtenBy5b(name: string): { raw: Record<string, unknown>; cardDb: Map<string, CardData> } {
  const file = JSON.parse(readFileSync(new URL("./fixtures/opt-963-5b-written-states.json", import.meta.url), "utf8")) as { cases: Record<string, WrittenCase> };
  const entry = file.cases[name];
  if (!entry) throw new Error(`no 5b-written case named ${name}`);
  return { raw: JSON.parse(JSON.stringify(entry.state)) as Record<string, unknown>, cardDb: new Map(Object.entries(entry.cardDb)) };
}
const WRITTEN_CASES = ["nested-batch-below-substitute-prompt", "effect-trigger-effect-retained-events", "both-trigger-windows", "optional-trigger-retained-events"] as const;

/** The Trigger window a REVEAL_TRIGGER prompt names, or null. */
function windowOfPrompt(state: GameState, prompt: PendingPromptState) {
  const owner = state.effectStack.find((frame) => frame.id === prompt.resumeContext);
  if (!owner) return null;
  if (owner.battleDamage?.stage === "TRIGGER_WINDOW") return owner.battleDamage;
  if (owner.effectDamage?.stage === "TRIGGER_WINDOW") return owner.effectDamage;
  return null;
}

/** Life card identities a REVEAL_TRIGGER prompt must not show to `responder`: the other player's Life area and every window held for the other player. */
function foreignLifeIdentities(state: GameState, responder: 0 | 1): Set<string> {
  const other = responder === 0 ? 1 : 0;
  const ids = new Set(state.players[other].life.map((card) => card.instanceId));
  for (const frame of state.effectStack) {
    const window = frame.battleDamage?.stage === "TRIGGER_WINDOW" ? frame.battleDamage : frame.effectDamage?.stage === "TRIGGER_WINDOW" ? frame.effectDamage : null;
    if (window && window.damagedPlayerIndex !== responder) ids.add(window.lifeCard.instanceId);
  }
  return ids;
}

function expectRevealPromptOwned(state: GameState) {
  const prompt = state.pendingPrompt;
  if (!prompt) return;
  const options = prompt.options;
  if (options.promptType !== "REVEAL_TRIGGER") return;
  const foreign = foreignLifeIdentities(state, prompt.respondingPlayer);
  const window = windowOfPrompt(state, prompt);
  expect(window?.damagedPlayerIndex).toBe(prompt.respondingPlayer);
  expect(options.cards.map((card) => [card.instanceId, card.controller, card.owner])).toEqual([[window!.lifeCard.instanceId, prompt.respondingPlayer, prompt.respondingPlayer]]);
  for (const card of options.cards) expect(foreign.has(card.instanceId)).toBe(false);
}

describe("PR #758 L5: a lifted Trigger-window prompt shows the responder their own Life card", () => {
  const WINDOW_GOLDENS = ["battle-trigger-window", "effect-damage-trigger-window", "both-trigger-windows"] as const;

  it.each(WINDOW_GOLDENS)("%s: after conversion options.cards[0] is the responder's own window card", (name) => {
    const state = liftedGolden(name);
    const prompt = state.pendingPrompt!;
    expect(prompt.options.promptType).toBe("REVEAL_TRIGGER");
    expectRevealPromptOwned(state);
  });

  it("both-trigger-windows: the version 2 prompt showed the battle defender's card; the lift re-points it at the effect window and rebuilds it with that window's card (generic text: the converter has no card data)", () => {
    const v2 = goldenV2Raw("both-trigger-windows") as { pendingPrompt: { respondingPlayer: number; options: { cards: Array<{ instanceId: string }>; effectDescription: string } } };
    const state = liftedGolden("both-trigger-windows");
    const prompt = state.pendingPrompt!;
    if (prompt.options.promptType !== "REVEAL_TRIGGER") throw new Error("expected a REVEAL_TRIGGER prompt");
    const effectWindow = effectTriggerWindow(state)!;
    expect(v2.pendingPrompt.respondingPlayer).toBe(1);
    expect(v2.pendingPrompt.options.cards[0].instanceId).toBe(battleTriggerLifeCard(state)!.instanceId);
    expect(prompt.respondingPlayer).toBe(0);
    expect(prompt.options.cards.map((card) => [card.instanceId, card.controller, card.owner])).toEqual([[effectWindow.lifeCard.instanceId, 0, 0]]);
    expect(prompt.options.cards[0].instanceId).not.toBe(battleTriggerLifeCard(state)!.instanceId);
    expect(prompt.options.effectDescription).toBe("You may reveal this Trigger card to activate its effect");
    expect(prompt.options.effectDescription).not.toBe(v2.pendingPrompt.options.effectDescription);
  });

  it("effect-damage-trigger-window: a version 2 prompt written for its own window without the card keeps its text and gets the card", () => {
    const v2 = goldenV2Raw("effect-damage-trigger-window") as { pendingPrompt: { options: { cards: unknown[]; effectDescription: string } } };
    expect(v2.pendingPrompt.options.cards).toEqual([]);
    const state = liftedGolden("effect-damage-trigger-window");
    const prompt = state.pendingPrompt!;
    if (prompt.options.promptType !== "REVEAL_TRIGGER") throw new Error("expected a REVEAL_TRIGGER prompt");
    expect(prompt.options.effectDescription).toBe(v2.pendingPrompt.options.effectDescription);
    expect(prompt.options.cards.map((card) => [card.instanceId, card.controller, card.owner])).toEqual([[effectTriggerWindow(state)!.lifeCard.instanceId, 1, 1]]);
  });

  it("no REVEAL_TRIGGER prompt of any version 3 fixture, lifted golden or 5b-written state shows a Life card of a player other than its responder", () => {
    for (const entry of STATES) expectRevealPromptOwned(convertPersistedGameState(persistedV3(entry.state), "state"));
    for (const name of LIFTED_GOLDEN_CASES) expectRevealPromptOwned(liftedGolden(name));
    for (const name of WRITTEN_CASES) expectRevealPromptOwned(convertPersistedGameState(writtenBy5b(name).raw, "state"));
  });

  it.each(WRITTEN_CASES)("5b-written %s: this reader loads what this writer wrote, and preserves its v3 projection through the v4 writer", (name) => {
    const { raw } = writtenBy5b(name);
    const loaded = convertPersistedGameState(raw, "state");
    const expected = structuredClone(raw);
    // Lifting root publication debt allocates one state-owned boundary ID.
    if (Array.isArray(expected.pendingEventActivationEvents) && expected.pendingEventActivationEvents.length)
      (expected.executionContext as { idCounter: number }).idCounter += 1;
    expect(persistedV3(loaded)).toEqual(expected);
    expect(classifyLegacyShapes(loaded)).toEqual([]);
  });
});

// ─── PR #758 fix round 3: retired keys stored with the value undefined ─────────

describe("PR #758 round 3: a version 2 object whose retired keys are present with the value undefined loads (structured clone keeps such keys; JSON drops them)", () => {
  /** The keys the version 2 terminal writer stored as explicit undefined, plus the other retired records, all undefined. */
  function withUndefinedRetiredKeys(v2: Record<string, unknown>): Record<string, unknown> {
    const turn = v2.turn as Record<string, unknown>;
    const battle = turn.battle as Record<string, unknown> | null;
    const stack = v2.effectStack as Array<Record<string, unknown>>;
    return {
      ...v2,
      turn: {
        ...turn,
        pendingTriggerFromEffect: undefined,
        pendingBattleDamageContinuation: undefined,
        ...(battle ? { battle: { ...battle, pendingTriggerLifeCard: undefined } } : {}),
      },
      effectStack: stack.map((frame) => ({ ...frame, replacementBatchContinuation: undefined })),
    };
  }
  const hasRetiredKey = (state: GameState) =>
    "pendingTriggerFromEffect" in state.turn ||
    "pendingBattleDamageContinuation" in state.turn ||
    (state.turn.battle !== null && "pendingTriggerLifeCard" in state.turn.battle) ||
    state.effectStack.some((frame) => "replacementBatchContinuation" in frame);

  it.each(["fresh-setup", "battle-ready-with-undo", "effect-frame-prompt"])("(a) %s: through SessionRepository.load, live and as an undo snapshot, the keys are gone and nothing is classified", async (name) => {
    const v2 = structuredClone(withUndefinedRetiredKeys(goldenV2Raw(name)));
    expect(Object.keys(v2.turn as object)).toContain("pendingTriggerFromEffect");
    const live = (await repository(storageWith(v2, [structuredClone(v2)])).load())!;
    expect(hasRetiredKey(live.state)).toBe(false);
    expect(hasRetiredKey(live.undoHistory[0])).toBe(false);
    expect(classifyLegacyShapes(live.state)).toEqual([]);
    expect(runtime(live.state)).toEqual(runtime(live.undoHistory[0]));
    expect(runtime(live.state)).toEqual(runtime({ ...liftedGolden(name), schemaVersion: 8, costSemanticsVersion: 7 }));
  });

  it("(b) through convertPersistedGameState on a structuredClone'd object", () => {
    const v2 = structuredClone(withUndefinedRetiredKeys(goldenV2Raw("battle-ready-with-undo")));
    const loaded = convertPersistedGameState(v2, "state");
    expect(hasRetiredKey(loaded)).toBe(false);
    expect(classifyLegacyShapes(loaded)).toEqual([]);
    expect(runtime(loaded)).toEqual(runtime(liftedGolden("battle-ready-with-undo")));
  });

  it("(c) a version 2 TERMINAL state as the version 2 terminateGame wrote it (status FINISHED, winner, both turn keys undefined, empty stack) loads", async () => {
    const base = goldenV2Raw("battle-ready-with-undo");
    const turn = base.turn as Record<string, unknown>;
    // terminal.ts at 1cd06cb5: effectStack [], pendingPrompt null, pendingEventActivationEvents undefined,
    // turn.battle null, battleSubPhase null, pendingTriggerFromEffect/pendingBattleDamageContinuation undefined.
    const terminal = structuredClone({
      ...base,
      status: "FINISHED",
      winner: 0,
      winReason: "concede",
      effectStack: [],
      pendingPrompt: null,
      pendingEventActivationEvents: undefined,
      turn: { ...turn, battle: null, battleSubPhase: null, pendingTriggerFromEffect: undefined, pendingBattleDamageContinuation: undefined },
    });
    const direct = convertPersistedGameState(structuredClone(terminal), "state");
    expect(direct.status).toBe("FINISHED");
    expect(direct.winner).toBe(0);
    expect(hasRetiredKey(direct)).toBe(false);
    const loaded = (await repository(storageWith(terminal, [structuredClone(terminal)])).load())!;
    expect(loaded.state.status).toBe("FINISHED");
    expect(hasRetiredKey(loaded.state)).toBe(false);
    expect(hasRetiredKey(loaded.undoHistory[0])).toBe(false);
    expect(classifyLegacyShapes(loaded.state)).toEqual([]);
  });

  it("a version 3 object carrying a retired key with the value undefined loads too, while a record is still rejected by name", () => {
    const v3 = structuredClone(persistedV3(byName("effect-window-with-parent-chain").state)) as Record<string, unknown>;
    const turn = v3.turn as Record<string, unknown>;
    v3.turn = { ...turn, pendingTriggerFromEffect: undefined, pendingBattleDamageContinuation: undefined };
    (v3.effectStack as Array<Record<string, unknown>>)[0] = { ...(v3.effectStack as Array<Record<string, unknown>>)[0], replacementBatchContinuation: undefined };
    const loaded = convertPersistedGameState(structuredClone(v3), "state");
    expect(hasRetiredKey(loaded)).toBe(false);
    expect(runtime(loaded)).toEqual(runtime(byName("effect-window-with-parent-chain").state));
  });
});
