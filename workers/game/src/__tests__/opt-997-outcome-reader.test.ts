/** Reader-first: synthetic explicit outcomes test the future wire semantics;
 * actual production outcome writers remain disabled until separate rollout. */
import { describe, expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { reloadLiveAndUndo } from "./opt-969-reader-fixtures.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { drainPendingWork } from "../engine/pending-work-drain.js";
import { resolverExecutionServices } from "../engine/effect-resolver/index.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { classifyLegacyShapes, toPersistedGameState } from "../session/game-state-schema.js";
import type { EffectStackFrame } from "../types.js";

function fixture(version: 6 | 7 = 6, mandatory = false) {
  const r = rig(); r.state.schemaVersion = version; delete r.state.costSemanticsVersion; r.deck(0, 5);
  for (let i = 0; i < 3; i++) r.put(`OPT997-hand-${i}`, 0, "HAND");
  const authored = getEffectSchema("OP17-043")!;
  const source = r.put("OP17-043", 0, "CHARACTER", { schema: synSchema("OP17-043", [...authored.effects.map(e => mandatory ? { ...e, flags: { ...e.flags, optional: false } } : e), { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { once_per_turn: true }, costs: [{ type: "REST_DON", amount: 1 }, { type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  return { r, source };
}
function setOutcome(frame: EffectStackFrame, outcome: string) {
  Object.assign(frame, { costReplacementResolution: outcome });
}

describe("OPT-997 explicit cost outcome reader, production writers disabled", () => {
  for (const reload of [false, true]) {
    it(`settles exact REPLACED owner after its child, preserving accepted rollback, reload=${reload}`, async () => {
      const { r, source } = fixture(7); r.accept();
      const owner = r.state.effectStack.find(f => f.costReplacementAction)!;
      expect(r.state.effectStack.at(-1)!.id).not.toBe(owner.id);
      setOutcome(owner, "REPLACED");
      if (reload) await reloadLiveAndUndo(r);
      const before = structuredClone(r.state);
      const waiting = drainPendingWork({ kind: "waiting", state: r.state, events: [], resolved: false }, r.db, resolverExecutionServices);
      expect(waiting.state).toEqual(before);
      r.select(r.state.players[0].hand.slice(0, 2).map(c => c.instanceId));
      expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
      expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(true);
      expect(r.state.players[0].hand).toHaveLength(1); expect(r.state.players[0].deck).toHaveLength(5);
      expect(r.state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(0);
      expect(r.state.turn.oncePerTurnUsed.activate?.includes(source.instanceId) ?? false).toBe(false);
      expect(r.state.eventLog.filter(e => e.type === "CARD_TRASHED" && e.payload.reason !== "cost")).toHaveLength(1);
      expect(r.state.eventLog.filter(e => e.type === "DON_RESTED")).toHaveLength(0);
      r.act({ type: "ATTACH_DON", targetInstanceId: source.instanceId, count: 1 });
      // PASS is legal only in Block/Counter Step. Start a real battle to
      // prove no orphaned COST owner rejects the next legal PASS.
      r.act({ type: "DECLARE_ATTACK", attackerInstanceId: source.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
      r.act({ type: "PASS" }, 1);
    });
  }
  it("consumes NOT_REPLACED once and replays the saved fixed payment", async () => {
    const { r, source } = fixture(7);
    // Isolated future producer: an exhausted decline finalizes the captured
    // COST owner, removes the offer and leaves no child or pending prompt.
    r.state.effectStack.pop(); r.state.pendingPrompt = null;
    const owner = r.state.effectStack.at(-1)!; setOutcome(owner, "NOT_REPLACED");
    await reloadLiveAndUndo(r);
    const paid = drainPendingWork({ kind: "continued", state: r.state, events: [], resolved: true }, r.db, resolverExecutionServices);
    r.state = paid.state;
    expect(r.state.effectStack).toHaveLength(0);
    expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(false);
    expect(r.state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(1);
    expect(r.state.players[0].deck).toHaveLength(4);
    expect(r.state.players[0].hand).toHaveLength(4);
    const before = structuredClone(r.state);
    expect(drainPendingWork({ kind: "continued", state: r.state, events: [], resolved: true }, r.db, resolverExecutionServices).state).toEqual(before);
  });
  it("does not infer an outcome for the legacy prompting-substitute debt", () => {
    const { r } = fixture(); r.accept();
    r.select(r.state.players[0].hand.slice(0, 2).map(c => c.instanceId));
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack.some(f => f.costReplacementAction)).toBe(true);
    expect(classifyLegacyShapes(r.state)).toContainEqual({ shape: "legacy.cost_replacement_outcome_unknown", frameId: r.state.effectStack.find(f => f.costReplacementAction)!.id });
  });
  it("strictly rejects wrong enum, absent pairing, invalid index and a non-COST owner", () => {
    const { r } = fixture(7); r.accept();
    const raw = toPersistedGameState(r.state);
    for (const tamper of ["enum", "action", "checked", "index", "kind"] as const) {
      const state = structuredClone(raw);
      const owner = state.effectStack.find(f => f.costReplacementAction)!;
      setOutcome(owner, "REPLACED");
      if (tamper === "enum") setOutcome(owner, "ACCEPTED");
      if (tamper === "action") delete owner.costReplacementAction;
      if (tamper === "checked") owner.costReplacementChecked = false;
      if (tamper === "index") owner.currentCostIndex = 999;
      if (tamper === "kind") { delete (owner as unknown as { costReplacementResolution?: string }).costReplacementResolution; setOutcome(state.effectStack[0], "REPLACED"); }
      expect(() => convertPersistedGameState(state, "state")).toThrow();
    }
  });
});


it("native7 early offer survives reload, records its exact outcome and completes after child reload", async () => {
  const { r, source } = fixture(7);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  expect(r.state.effectStack.find(f => f.costReplacementAction)!.costReplacementResolution).toBeUndefined();
  await reloadLiveAndUndo(r);
  r.accept();
  expect(r.state.effectStack.find(f => f.costReplacementAction)!.costReplacementResolution).toBe("REPLACED");
  expect(r.promptType()).toBe("SELECT_TARGET");
  await reloadLiveAndUndo(r);
  r.select(r.state.players[0].hand.slice(0, 2).map(c => c.instanceId));
  expect(r.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 7 });
  expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(true);
  expect(r.state.eventLog.filter(e => e.type === "CARD_TRASHED")).toHaveLength(1);
  expect(r.state.eventLog.filter(e => e.type === "DON_RESTED")).toHaveLength(0);
});

it("native7 mandatory replacement inserts COST below its actual prompt-owning child", async () => {
  const { r } = fixture(7, true);
  expect(r.promptType()).toBe("SELECT_TARGET");
  const owner = r.state.effectStack.findIndex(f => f.costReplacementAction !== undefined);
  expect(owner).toBeLessThan(r.state.effectStack.length - 1);
  expect(r.state.effectStack[owner].costReplacementResolution).toBe("REPLACED");
  await reloadLiveAndUndo(r);
  r.select(r.state.players[0].hand.slice(0, 2).map(c => c.instanceId));
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
});

it("rejects v7-only fields under every old source version before conversion", () => {
  const { r } = fixture(7); r.accept();
  const native = toPersistedGameState(r.state);
  for (const schemaVersion of [undefined, 1, 2, 3, 4, 5, 6]) {
    const raw = { ...native, schemaVersion };
    if (schemaVersion === undefined) delete raw.schemaVersion;
    expect(() => convertPersistedGameState(raw, "undoHistory[1]")).toThrow("requiring schemaVersion 7");
  }
});

it("FINAL ordinary7 Ganzui prompting substitute settles its captured COST once on deployed reader and accepts legal PASS", async () => {
  const { runtime, memory, command, save } = await import("./native7-producer-support.js");
  const writer = await runtime();
  const reader = await runtime(process.env.OPT969_WRITER_READER_ROOT);
  const { r, source } = fixture(7);
  expect(r.state.schemaVersion).toBe(7);
  const capturedId = r.state.effectStack.find(frame => frame.costReplacementAction)!.id;
  let loaded = (await memory(reader, await save(writer, r.state, r.db)).repo.load())!;
  expect(loaded.state.effectStack.find(frame => frame.id === capturedId)?.costReplacementResolution).toBeUndefined();
  loaded.state = command(reader, loaded.state, loaded.cardDb, { type: "PLAYER_CHOICE", choiceId: "accept" });
  expect(loaded.state.effectStack.find(frame => frame.id === capturedId)?.costReplacementResolution).toBe("REPLACED");
  expect(loaded.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  const m = memory(reader);
  await m.repo.save({ ...loaded, undoHistory: [loaded.state] });
  loaded = (await m.repo.load())!;
  expect(loaded.undoHistory[0].effectStack.find(frame => frame.id === capturedId)?.costReplacementResolution).toBe("REPLACED");
  const ids = loaded.state.players[0].hand.slice(0, 2).map(card => card.instanceId);
  const reply = { type: "SELECT_TARGET" as const, selectedInstanceIds: ids, promptId: loaded.state.pendingPrompt!.promptId };
  loaded.state = command(reader, loaded.state, loaded.cardDb, reply);
  const done = (await memory(reader, await save(reader, loaded.state, loaded.cardDb)).repo.load())!.state;
  expect(done.pendingPrompt).toBeNull(); expect(done.effectStack).toEqual([]);
  expect(done.players[0].characters.some(card => card?.instanceId === source.instanceId)).toBe(true);
  expect(done.players[0].hand).toHaveLength(1); expect(done.players[0].deck).toHaveLength(5);
  expect(done.players[0].donCostArea.filter(don => don.state === "RESTED")).toEqual([]);
  expect(done.turn.oncePerTurnUsed.activate?.includes(source.instanceId) ?? false).toBe(false);
  expect(done.eventLog.filter(event => event.type === "CARD_TRASHED")).toHaveLength(1);
  expect(done.eventLog.filter(event => event.type === "DON_RESTED")).toEqual([]);
  const before = structuredClone(done);
  expect(new reader.SessionCoordinator().executeAction(done, [], 0, reply, loaded.cardDb).kind).toBe("reject");
  expect(done).toEqual(before);
  const attached = command(reader, done, loaded.cardDb, { type: "ATTACH_DON", targetInstanceId: source.instanceId, count: 1 });
  const attacking = command(reader, attached, loaded.cardDb, { type: "DECLARE_ATTACK", attackerInstanceId: source.instanceId, targetInstanceId: done.players[1].leader.instanceId });
  const passed = command(reader, attacking, loaded.cardDb, { type: "PASS" }, 1);
  expect(passed.effectStack.some(frame => frame.id === capturedId)).toBe(false);
});
