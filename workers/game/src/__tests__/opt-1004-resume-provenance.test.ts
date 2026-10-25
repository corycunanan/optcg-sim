import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { CardData, GameAction, GameState, QueuedSourceSnapshot } from "../types.js";
import { GameSession } from "../GameSession.js";
import { SessionRepository, convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState, classifyLegacyShapes } from "../session/game-state-schema.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { EFFECT_SOURCE_SNAPSHOT_REF } from "../engine/effect-types.js";
import { collectEndOfTurnObligations, processScheduledActions } from "../engine/duration-tracker.js";
import { rig } from "./opt-960-rig.js";
import { resolveEffectWork, resolveScheduledEffectWork } from "../engine/effect-resolver/resolver.js";
import { settleResumeProvenance } from "../engine/effect-resolver/resume-provenance.js";
import { resumeFromStackWork } from "../engine/effect-resolver/resume.js";
const directory = resolve(__dirname, "fixtures/opt-1004-historical-resume");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
type Stored = Record<string, unknown> & { session: { state: GameState } };
const loadBytes = (file: string): Stored => JSON.parse(gunzipSync(readFileSync(resolve(directory, file))).toString());
const memory = (values: Stored) => { const storage = new MemorySessionStorage(); Object.entries(values).forEach(([key, value]) => storage.data.set(key, structuredClone(value))); return storage; };
const options = { nextJsUrl: "https://app.example.test", workerSecret: "test" };
async function act(storage: MemorySessionStorage, action: GameAction, rejected = false, player?: 0 | 1) {
  const loaded = (await new SessionRepository(storage, options).load())!;
  const session = new GameSession({ storage, getWebSockets: () => [], getTags: () => [], acceptWebSocket() {} } as unknown as DurableObjectState, { GAME_WORKER_SECRET: "test", NEXTJS_URL: options.nextJsUrl } as never) as unknown as { gameState: GameState; cardDb: Map<string, CardData>; undoHistory: GameState[]; writeResultToDb(): Promise<void>; handleAction(ws: WebSocket, player: 0 | 1, action: GameAction): Promise<void> };
  session.gameState = loaded.state; session.cardDb = loaded.cardDb; session.undoHistory = loaded.undoHistory;
  session.writeResultToDb = async () => undefined;
  const messages: { type: string }[] = [];
  await session.handleAction({ send(value: string) { messages.push(JSON.parse(value)); }, close() {} } as unknown as WebSocket, player ?? loaded.state.pendingPrompt?.respondingPlayer ?? 0, { ...action, ...(!("promptId" in action && action.promptId) && loaded.state.pendingPrompt?.promptId ? { promptId: loaded.state.pendingPrompt.promptId } : {}) });
  if (rejected) expect(messages.some(message => message.type === "action:rejected")).toBe(true);
  else expect(messages.filter(message => message.type === "action:rejected")).toEqual([]);
  return (await new SessionRepository(storage, options).load())!;
}
function owner(state: GameState) { return state.effectStack.find(frame => frame.resultRefs.some(([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF))!; }
function origin(state: GameState) { return owner(state).resultRefs.find(([key]) => key === EFFECT_SOURCE_SNAPSHOT_REF)![1]; }
function upgrade(values: Stored) { const result = structuredClone(values); result.session.state.schemaVersion = 10; result.session.state.fieldTrashSemanticsVersion = 8; return result; }
const reply = (state: GameState): GameAction => {
  const prompt = state.pendingPrompt!.options;
  return prompt.promptType === "SELECT_TARGET"
    ? { type: "SELECT_TARGET", selectedInstanceIds: [prompt.validTargets[0]] }
    : { type: "PLAYER_CHOICE", choiceId: "choose-value:1" };
};
it("pins unchanged actual historical producer bytes and capture sources", () => {
  for (const [name, digest] of Object.entries(manifest.files)) expect(createHash("sha256").update(readFileSync(resolve(directory, name))).digest("hex"), name).toBe(digest);
  expect(manifest.files["action-mode8.json.gz"]).toBe("176975d1f98394481a7a91caa5c97294e4988b7f1a2a616997731da9d33c9637");
});
for (const [name, entry] of Object.entries(manifest.cases) as [string, { file: string; phase: string; costMode: number }][]) describe(name, () => {
  it("loaded10 accepts historical continuation with exact full or identity-only origin", async () => {
    const storage = memory(upgrade(loadBytes(entry.file))); const before = (await new SessionRepository(storage, options).load())!;
    const identity = structuredClone(origin(before.state).sourceIdentity!);
    const after = await act(storage, reply(before.state));
    expect(after.state).toMatchObject({ schemaVersion: 10, fieldTrashSemanticsVersion: 8, costSemanticsVersion: entry.costMode });
    expect(after.state.scheduledActions[0].sourceIdentity).toEqual(identity);
    if (entry.phase === "COST") expect(after.state.scheduledActions[0].sourceCardSnapshot).toMatchObject({ instanceId: identity.instanceId, cardId: identity.cardId, controller: identity.controller });
    else expect(after.state.scheduledActions[0].sourceCardSnapshot).toBeUndefined();
    expect(classifyLegacyShapes(after.state).some(report => report.shape === "legacy.scheduled_origin_unknown")).toBe(false);
    const mixed = parseStoredSession({ state: toPersistedGameState(after.state), undoHistory: [loadBytes(entry.file).session.state, toPersistedGameState(after.state)], cardDb: Object.fromEntries(after.cardDb), mode: "PVP" });
    expect(mixed.undoHistory.map(state => state.schemaVersion)).toEqual([8, 10]);
  });
  it.each([8, 9] as const)("writer source%s accepted historical resume captures proven origin", async version => {
    const raw = loadBytes(entry.file); raw.session.state.schemaVersion = version;
    const storage = memory(raw); const after = await act(storage, reply(raw.session.state));
    expect(after.state).toMatchObject({ schemaVersion: 10, fieldTrashSemanticsVersion: version === 9 ? 9 : 8, costSemanticsVersion: entry.costMode });
    const identity = origin(raw.session.state).sourceIdentity!;
    expect(after.state.scheduledActions[0].sourceIdentity).toEqual(identity);
    if (entry.phase === "COST") expect(after.state.scheduledActions[0].sourceCardSnapshot).toMatchObject({ instanceId: identity.instanceId, cardId: identity.cardId, controller: identity.controller });
    else expect(after.state.scheduledActions[0].sourceCardSnapshot).toBeUndefined();
  });
  it.each(["wrong", "PASS", "skip"])("does not leak provenance on %s response", async path => {
    const storage = memory(upgrade(loadBytes(entry.file))); const loaded = (await new SessionRepository(storage, options).load())!;
    const original = structuredClone(loaded.state);
    const action = path === "PASS" ? { type: "PASS" } : path === "wrong" ? { type: "PLAYER_CHOICE", choiceId: "not-offered" } : path === "skip" ? { type: "PLAYER_CHOICE", choiceId: "skip" } : { ...reply(loaded.state), promptId: "stale" };
    const result = resumeFromStackWork(loaded.state, action as GameAction, loaded.cardDb);
    expect(loaded.state).toEqual(original);
    expect(result.state.schemaVersion).toBe(10);
    expect(result.state.effectStack.flatMap(frame => frame.resultRefs).some(([, value]) => value.sourceCardSnapshot)).toBe(false);
    if (entry.phase === "COST" || path === "wrong") {
      expect(toPersistedGameState({ ...result.state, pendingPrompt: original.pendingPrompt })).toEqual(toPersistedGameState(original));
    }
  });
  it.each(["stale", "wrong player", "unsupported"])("public %s response preserves exact saved bytes", async path => {
    const storage = memory(upgrade(loadBytes(entry.file)));
    const loaded = (await new SessionRepository(storage, options).load())!;
    const before = structuredClone([...storage.data]); const writes = structuredClone(storage.writes);
    const response: GameAction = path === "unsupported" ? { type: "PLAY_CARD", cardInstanceId: "not-a-card" }
      : { ...reply(loaded.state), ...(path === "stale" ? { promptId: "stale" } : {}) };
    await act(storage, response, true, path === "wrong player" ? 1 : undefined);
    expect([...storage.data]).toEqual(before); expect(storage.writes).toEqual(writes);
  });
});

it("identity-only scheduled origins retain provenance controller, survive re-entry and both collectors", async () => {
  const values = upgrade(loadBytes("action-mode8.json.gz")); const storage = memory(values); const before = (await new SessionRepository(storage, options).load())!;
  const after = await act(storage, reply(before.state)); const obligation = after.state.scheduledActions[0];
  expect(processScheduledActions(after.state, "END_OF_THIS_TURN").actionsToRun[0].sourceIdentity).toEqual(obligation.sourceIdentity);
  expect(collectEndOfTurnObligations(after.state, 0, "TURN_PLAYER").entries[0].sourceIdentity).toEqual(obligation.sourceIdentity);
  const source = obligation.sourceIdentity!; const fresh = { ...after.state.players[0].trash.find(card => card.cardId === source.cardId)!, instanceId: "new-entry", zone: "CHARACTER" as const };
  after.state.players[0].characters[0] = fresh;
  const queued = resolveEffectWork(after.state, { id: source.effectBlockId, category: "auto", actions: [{ type: "DRAW", params: { amount: 1 } }] }, source.instanceId, source.controller, after.cardDb, undefined, undefined, undefined, source);
  expect(queued.effectNotActivated).toBe(true);
  obligation.controller = 1;
  expect(() => convertPersistedGameState(toPersistedGameState(after.state), "state")).not.toThrow();
});
it.each(["missing card", "extra key", "bad controller", "wrong owner"])("strict scheduled identity rejects %s and relabeling<=9", async variant => {
  const storage = memory(upgrade(loadBytes("action-mode8.json.gz"))); const before = (await new SessionRepository(storage, options).load())!;
  const after = await act(storage, reply(before.state)); const raw = JSON.parse(JSON.stringify(toPersistedGameState(after.state)));
  const identity = raw.scheduledActions[0].sourceIdentity;
  if (variant === "missing card") delete identity.cardId;
  else if (variant === "extra key") identity.zone = "CHARACTER";
  else if (variant === "bad controller") identity.controller = 2;
  else identity.instanceId = "wrong";
  expect(() => convertPersistedGameState(raw, "state")).toThrow(/sourceIdentity/);
  for (const version of [8, 9]) {
    const old = JSON.parse(JSON.stringify(toPersistedGameState(after.state))); old.schemaVersion = version; delete old.fieldTrashSemanticsVersion;
    expect(() => convertPersistedGameState(old, "state")).toThrow(/sourceIdentity requires schemaVersion 10/);
  }
});
it("COST exact source with changed controller keeps identity-only rather than inventing a matching full card", async () => {
  const values = upgrade(loadBytes("cost-mode6.json.gz")); const source = origin(values.session.state).sourceIdentity!;
  values.session.state.players[0].characters.find(card => card?.instanceId === source.instanceId)!.controller = 1;
  const storage = memory(values); const after = await act(storage, reply(values.session.state));
  expect(after.state.scheduledActions[0].sourceIdentity).toEqual(source);
  expect(after.state.scheduledActions[0].sourceCardSnapshot).toBeUndefined();
});

it.each(["Character", "Leader", "Event"] as const)("identity-only %s origin remains distinct from execution controller", type => {
  const r = rig(); r.state.schemaVersion = 10; r.state.fieldTrashSemanticsVersion = 8;
  const source = r.put(`SYN-origin-${type}`, 0, type === "Leader" ? "LEADER" : type === "Event" ? "HAND" : "CHARACTER", { data: { type } });
  const identity: QueuedSourceSnapshot = { instanceId: source.instanceId, cardId: source.cardId, controller: 0, effectBlockId: "original-authored" };
  if (type === "Character") r.state.players[0].characters = r.state.players[0].characters.map(card => card?.instanceId === source.instanceId ? null : card);
  else if (type === "Event") r.state.players[0].hand = [];
  else r.state.players[0].leader = { ...source, instanceId: "replacement-leader" };
  const blocker = r.put("OP10-030", 1, "CHARACTER"); r.state.turn.activePlayerIndex = 1;
  r.state.players[1].donCostArea.forEach(don => don.state = "RESTED");
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: blocker.instanceId, effectId: "activate_set_don_active_then_prohibit" }, 1);
  r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:0" }, 1);
  const entry = { sourceEffectId: source.instanceId, sourceIdentity: identity, controller: 1 as const, action: { type: "SET_DON_ACTIVE" as const, params: { amount: 1 } } };
  const result = resolveScheduledEffectWork(r.state, entry, r.db);
  expect(result.events.filter(event => event.type === "DON_SET_ACTIVE")).toHaveLength(type === "Character" ? 0 : 1);
});
it("parked End Phase identity-only origins remain strict through reply and reload", async () => {
  const storage = memory(upgrade(loadBytes("action-mode8.json.gz"))); const before = (await new SessionRepository(storage, options).load())!;
  const after = await act(storage, reply(before.state)); const r = rig(); r.state = after.state;
  after.cardDb.forEach((data, id) => r.db.set(id, data));
  const blocker = r.put("OP10-030", 0, "CHARACTER"); r.state.players[0].donCostArea.forEach(don => don.state = "RESTED");
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: blocker.instanceId, effectId: "activate_set_don_active_then_prohibit" }); r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:0" });
  r.state.scheduledActions.unshift({ ...r.state.scheduledActions[0], id: "park-origin", action: { type: "CHOOSE_VALUE", result_ref: "park-choice", params: { domain: "NUMBER", constraints: { min: 0, max: 1 } } } });
  r.act({ type: "ADVANCE_PHASE" });
  const frame = r.state.effectStack.find(frame => frame.phaseBoundaryContinuation)!;
  expect(frame.phaseBoundaryContinuation!.remainingScheduledActions[0].sourceIdentity).toBeDefined();
  const malformed = JSON.parse(JSON.stringify(toPersistedGameState(r.state)));
  malformed.effectStack.find((row: { id: string }) => row.id === frame.id).phaseBoundaryContinuation.remainingScheduledActions[0].sourceIdentity.instanceId = "another-owner";
  expect(() => convertPersistedGameState(malformed, "state")).toThrow(/remainingScheduledActions.*sourceIdentity.instanceId must match sourceEffectId/);
  await r.reload(); r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
  expect(r.state.eventLog.filter(event => event.type === "DON_SET_ACTIVE")).toHaveLength(0);
});
it("dual origins and generic/action vs authored COST owners reject contradictions before projection", async () => {
  const storage = memory(upgrade(loadBytes("cost-mode8.json.gz"))); const before = (await new SessionRepository(storage, options).load())!;
  const after = await act(storage, reply(before.state));
  for (const key of ["cardId", "controller", "instanceId"] as const) {
    const raw = JSON.parse(JSON.stringify(toPersistedGameState(after.state)));
    raw.scheduledActions[0].sourceCardSnapshot[key] = key === "controller" ? 1 : "disagrees";
    expect(() => convertPersistedGameState(raw, "state")).toThrow(/sourceCardSnapshot disagrees with sourceIdentity/);
  }
  for (const file of ["action-mode8.json.gz", "cost-mode8.json.gz"]) {
    const values = upgrade(loadBytes(file)); const frame = owner(values.session.state);
    origin(values.session.state).sourceIdentity!.instanceId = "wrong-owner";
    expect(() => convertPersistedGameState(values.session.state, "state")).toThrow(/sourceIdentity disagrees with its effect frame owner/);
    expect(frame).toBeDefined();
  }
});
it("no-op waiting and retained-event abandonment do not publish tentative writer metadata; retained COST progress does", () => {
  const values = loadBytes("cost-mode6.json.gz"); const state = values.session.state; const frame = owner(state);
  const prepared: GameState = { ...state, schemaVersion: 10, fieldTrashSemanticsVersion: 8, effectStack: state.effectStack.map(row => row.id === frame.id ? { ...row, resultRefs: row.resultRefs.map(([key, value]) => key === EFFECT_SOURCE_SNAPSHOT_REF ? [key, { ...value, sourceCardSnapshot: structuredClone(state.players[0].characters.find(card => card?.instanceId === frame.sourceCardInstanceId)!) }] : [key, value]) } : row) };
  const waiting = settleResumeProvenance(state, prepared, { kind: "waiting", state: prepared, events: [], resolved: false });
  expect(toPersistedGameState(waiting.state)).toEqual(toPersistedGameState(state));
  const debt = { type: "CARD_TRASHED" as const, playerIndex: 0 as const, payload: { cardId: "old-paid-cost", reason: "cost" } };
  const abandoned = settleResumeProvenance(state, prepared, { kind: "completed", state: { ...prepared, effectStack: prepared.effectStack.filter(row => row.id !== frame.id) }, events: [debt], resolved: true, resumeBodyAbandoned: true });
  expect(abandoned.state.schemaVersion).toBe(8); expect(abandoned.state.fieldTrashSemanticsVersion).toBeUndefined(); expect(abandoned.events).toEqual([debt]);
  const progressed = { ...prepared, effectStack: prepared.effectStack.map(row => row.id === frame.id ? { ...row, currentCostIndex: row.currentCostIndex + 1 } : row) };
  const queued = settleResumeProvenance(state, prepared, { kind: "queued", state: progressed, events: [debt], resolved: false });
  expect(queued.state).toBe(progressed); expect(queued.state.schemaVersion).toBe(10);
  const scheduled = { id: "committed-before-terminal", timing: "END_OF_THIS_TURN" as const, action: { type: "DRAW" as const, params: { amount: 1 } }, boundToInstanceId: null, sourceEffectId: frame.sourceCardInstanceId, controller: 0 as const, sourceIdentity: origin(state).sourceIdentity };
  const terminal = settleResumeProvenance(state, prepared, { kind: "terminal", state: { ...prepared, status: "FINISHED", effectStack: [], scheduledActions: [scheduled] }, events: [], resolved: false });
  expect(terminal.state.schemaVersion).toBe(10); expect(() => toPersistedGameState(terminal.state)).not.toThrow();
  const field = settleResumeProvenance(state, prepared, { kind: "completed", state: { ...prepared, fieldTrashSemanticsVersion: 9, effectStack: [] }, events: [debt], resolved: true, resumeBodyAbandoned: true });
  expect(field.state.schemaVersion).toBe(9); expect(field.state.fieldTrashSemanticsVersion).toBeUndefined();
});

it.each(["cost-next", "action-next"])("loaded10 preserves origin before a later %s pause", async name => {
  const storage = memory(upgrade(loadBytes(name + "-mode8.json.gz"))); const before = (await new SessionRepository(storage, options).load())!;
  const identity = structuredClone(origin(before.state).sourceIdentity!);
  const next = await act(storage, reply(before.state));
  expect(next.state.schemaVersion).toBe(10); expect(next.state.pendingPrompt).not.toBeNull();
  expect(next.state.scheduledActions).toHaveLength(0);
  expect(origin(next.state).sourceIdentity).toEqual(identity);
  if (name === "cost-next") expect(origin(next.state).sourceCardSnapshot?.instanceId).toBe(identity.instanceId);
  else expect(origin(next.state).sourceCardSnapshot).toBeUndefined();
  const final = await act(storage, reply(next.state));
  expect(final.state.scheduledActions[0].sourceIdentity).toEqual(identity);
});
it("loaded10 retains an actual scheduled identity when a later DRAW terminates the continuation", async () => {
  const storage = memory(upgrade(loadBytes("action-terminal-mode8.json.gz"))); const before = (await new SessionRepository(storage, options).load())!;
  const after = await act(storage, reply(before.state));
  expect(after.state.status).not.toBe("IN_PROGRESS"); expect(after.state.schemaVersion).toBe(10);
  expect(after.state.scheduledActions[0].sourceIdentity).toEqual(origin(before.state).sourceIdentity);
  expect(() => convertPersistedGameState(toPersistedGameState(after.state), "state")).not.toThrow();
});
