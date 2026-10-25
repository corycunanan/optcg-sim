import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { afterEach, beforeAll, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { GameAction, GameState } from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { runtime, memory, type Runtime } from "./native7-producer-support.js";
import { frameKindOf } from "../engine/frame-kinds.js";
import { setupGame } from "./helpers.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

let floor: Runtime;
beforeAll(async () => { floor = await runtime(process.env.OPT1006_WRITER_FLOOR_ROOT); });
const captures: { r: Rig; initial: GameState; starts: GameState[]; replies: GameAction[]; history: GameState[][] }[] = [];
function setup(mode: 6 | 7 | 8 = 8) {
  expect(setupGame().state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 });
  const r = rig(); expect(r.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 }); r.deck(0, 10); r.deck(1, 10); r.leader(0, "OP11-001");
  r.state = { ...r.state, schemaVersion: 8, costSemanticsVersion: mode };
  const capture = { r, initial: structuredClone(r.state), starts: [] as GameState[], replies: [] as GameAction[], history: [] as GameState[][] }; captures.push(capture);
  const coordinator = new SessionCoordinator(); let undo: GameState[] = [];
  r.act = (action, player) => {
    const prompt = r.state.pendingPrompt;
    const reply = prompt ? { ...action, promptId: prompt.promptId } as GameAction : action;
    if (prompt) { capture.starts.push(structuredClone(r.state)); capture.replies.push(structuredClone(reply)); capture.history.push(structuredClone(undo)); }
    const rt = r.state.schemaVersion === 9 ? floor : undefined;
    const activeCoordinator = rt ? new rt.SessionCoordinator() : coordinator;
    const routed = activeCoordinator.executeAction(r.state, undo, player ?? prompt?.respondingPlayer ?? r.state.turn.activePlayerIndex, reply, r.db);
    expect(routed.kind, "reason" in routed ? routed.reason : "").not.toBe("reject");
    undo = routed.undoHistory;
    if (routed.kind === "resume") {
      const resumed = (rt?.resumePromptLifecycle ?? resumePromptLifecycle)(routed.state, reply, r.db, { drainPregame: state => state, advanceStartOfTurn: state => state });
      expect(resumed.responseRejected).toBe(false); r.state = resumed.state;
    } else r.state = routed.state;
  };
  r.reload = async () => {
    const rt = r.state.schemaVersion === 9 ? floor : await runtime();
    const saved = memory(rt);
    await saved.repo.save({ state: r.state, cardDb: r.db, undoHistory: undo, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
    const loaded = (await saved.repo.load())!; r.state = loaded.state; undo = loaded.undoHistory;
  };
  return r;
}
function prepare(r: Rig, navy = true, trash = 3, count = 1) {
  const targets = Array.from({ length: count }, (_, i) => r.put(`OPT1001-NAVY-${i}`, 0, "CHARACTER", { data: { power: 5000, types: navy ? ["Navy"] : ["Straw Hat Crew"] } }));
  const payment = Array.from({ length: trash }, (_, i) => r.put(`OPT1001-PAY-${i}`, 0, "TRASH"));
  return { targets, payment };
}
function beckman(r: Rig, ids: string[]) {
  const card = r.put("OP09-009", 1, "HAND", { data: { cost: 7, power: 9000 } });
  r.state.players[1].donCostArea = Array.from({ length: 10 }, (_, i) => ({ instanceId: `opt1001-don-${i}`, state: "ACTIVE", attachedTo: null }));
  r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId }, 1); r.select(ids);
  return card;
}
const alive = (r: Rig, id: string) => r.state.players[0].characters.some(card => card?.instanceId === id);
async function pay(r: Rig, ids: string[]) {
  r.accept(); await r.reload(); if (r.promptType() === "SELECT_TARGET") r.select(ids);
  if (r.promptType() === "ARRANGE_TOP_CARDS") {
    await r.reload(); r.act({ type: "ARRANGE_TOP_CARDS", orderedInstanceIds: [...ids].reverse(), keptCardInstanceId: "", destination: "bottom" });
  }
}
function event(r: Rig, action: Action) {
  const source = r.put("OPT1001-EVENT", 1, "HAND", { schema: synSchema("OPT1001-EVENT", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [action] }], "Event"), data: { type: "Event", cost: 0, power: null, effectText: "[Main] Trash Characters." } });
  r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, 1);
}
for (const mode of [6, 7, 8] as const) for (const accept of [false, true]) it(`OPT-1001 authored Beckman Koby ${accept ? "accept" : "decline"} mode${mode} reload`, async () => {
  const r = setup(mode); const { targets, payment } = prepare(r); const source = beckman(r, [targets[0].instanceId]);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); expect(r.state.pendingPrompt!.respondingPlayer).toBe(0);
  expect(alive(r, targets[0].instanceId)).toBe(true); await r.reload();
  const batch = r.state.effectStack.find(frame => frame.replacementBatch)!.replacementBatch!;
  expect(batch.actionKind).toBe("TRASH_CARD"); expect(batch.causingController).toBe(1);
  expect(batch.causingSource).toMatchObject({ cardId: source.cardId, cardType: "Character" });
  if (accept) await pay(r, payment.map(card => card.instanceId)); else r.decline();
  expect(alive(r, targets[0].instanceId)).toBe(accept);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]);
  expect(r.state.eventLog.filter(event => event.type === "CARD_KO")).toHaveLength(0);
  expect(r.state.players[0].trash).toHaveLength(accept ? 0 : 4);
  expect(r.state.schemaVersion).toBe(9); expect(r.state.costSemanticsVersion).toBe(mode);
});
it("OPT-1001 one payment protects simultaneous group and all members stay field during payment", async () => {
  const r = setup(); const { targets, payment } = prepare(r, true, 3, 2);
  event(r, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } });
  r.accept(); expect(targets.every(card => alive(r, card.instanceId))).toBe(true); expect(r.state.players[0].trash).toHaveLength(3);
  await r.reload(); if (r.promptType() === "SELECT_TARGET") r.select(payment.map(card => card.instanceId));
  if (r.promptType() === "ARRANGE_TOP_CARDS") r.act({ type: "ARRANGE_TOP_CARDS", orderedInstanceIds: payment.map(card => card.instanceId), keptCardInstanceId: "", destination: "bottom" });
  expect(targets.every(card => alive(r, card.instanceId))).toBe(true); expect(r.state.pendingPrompt).toBeNull(); expect(r.state.players[0].trash).toHaveLength(0);
});
for (const [navy, trash] of [[false, 3], [true, 2]] as const) it(`OPT-1001 no offer navy${navy} trash${trash}, no sibling funds another`, () => {
  const r = setup(); const { targets } = prepare(r, navy, trash, 2);
  event(r, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } });
  expect(r.state.pendingPrompt).toBeNull(); expect(targets.some(card => alive(r, card.instanceId))).toBe(false);
  expect(r.state.eventLog.filter(event => event.type === "CARD_KO")).toHaveLength(0);
  expect(r.state.players[0].trash).toHaveLength(trash + 2);
});
function activateNoMatch(r: Rig) {
  prepare(r, false, 0, 1);
  event(r, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } });
  expect(r.state.schemaVersion).toBe(9); expect(r.state.pendingPrompt).toBeNull();
}
it("OPT-1001 native9 successor trash after stable save still offers Ganzui", async () => {
  const r = setup(); activateNoMatch(r); await r.reload();
  const target = r.put("OP17-043", 0, "CHARACTER", { data: { power: 5000 } });
  const hand = Array.from({ length: 3 }, (_, i) => r.put(`OPT1001-GANZUI-HAND-${i}`, 0, "HAND"));
  beckman(r, [target.instanceId]); expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  r.accept(); expect(r.promptType()).toBe("SELECT_TARGET"); await r.reload(); r.select(hand.slice(0, 2).map(card => card.instanceId));
  expect(alive(r, target.instanceId)).toBe(true); expect(r.state.players[0].hand).toHaveLength(1); expect(r.state.pendingPrompt).toBeNull();
});
for (const accept of [false, true]) it(`OPT-1001 native9 downstream mode8 COST keeps Decision10 debt accept=${accept}`, async () => {
  const r = setup(); activateNoMatch(r); await r.reload(); r.leader(0, "OP01-060");
  const source = r.put("ST22-005", 0, "CHARACTER", { state: "RESTED" });
  const target = r.put("OP17-043", 0, "CHARACTER");
  for (let i = 0; i < 3; i++) r.put(`OPT1001-POLICY-HAND-${i}`, 0, "HAND");
  r.state.players[0].donCostArea = Array.from({ length: 3 }, (_, i) => ({ instanceId: `policy9-don-${i}`, state: "ACTIVE", attachedTo: null }));
  r.state.turn.activePlayerIndex = 0;
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate_set_active" });
  r.accept(); await r.reload(); r.select([target.instanceId]); expect(r.promptType()).toBe("OPTIONAL_EFFECT"); await r.reload();
  if (accept) { r.accept(); const prompt = r.state.pendingPrompt!.options; if (prompt.promptType !== "SELECT_TARGET") throw new Error("hand payment"); await r.reload(); r.select(prompt.validTargets.slice(0, 2)); } else r.decline();
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]);
  // OPT-958 retained known deviation: accepted substitute restores prior DON
  // and leaves use unconsumed; rule-literal8-3-1-3-1 retains prior paid DON.
  expect(r.state.players[0].donCostArea.filter(card => card.state === "RESTED")).toHaveLength(accept ? 0 : 3);
  expect(r.state.turn.oncePerTurnUsed.activate_set_active?.includes(source.instanceId) ?? false).toBe(!accept);
  expect(r.state.schemaVersion).toBe(9); expect(r.state.costSemanticsVersion).toBe(8);
});
it("OPT-1001 native9 downstream battle completion retains protection through EOB prompt", async () => {
  const r = setup(); activateNoMatch(r); await r.reload();
  const attacker = r.put("ST08-013", 1, "CHARACTER", { data: { power: 4000 } });
  attacker.attachedDon = [{ instanceId: "native9-attack-don", state: "ACTIVE", attachedTo: attacker.instanceId }]; attacker.turnPlayed = 0;
  const target = r.put("OPT1001-BATTLE-TARGET", 0, "CHARACTER", { state: "RESTED", data: { power: 1000 } });
  const hand = r.put("OPT1001-BATTLE-PAYMENT", 0, "HAND");
  const counter = r.put("OP02-118", 0, "HAND", { data: { type: "Event", cost: 0, power: null, counter: null, effectText: "[Counter] Protect a Character." } });
  r.state.turn.activePlayerIndex = 1;
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1); r.act({ type: "PASS" }, 0);
  r.act({ type: "USE_COUNTER_EVENT", cardInstanceId: counter.instanceId, counterTargetInstanceId: target.instanceId }, 0);
  r.accept(); r.select([hand.instanceId]); r.select([target.instanceId]); r.act({ type: "PASS" }, 0);
  expect(r.state.effectStack.some(frame => frame.battleCompletion)).toBe(true); expect(r.state.prohibitions).toHaveLength(1); await r.reload();
  // This family captures the actual downstream EOB owner; earlier Counter
  // setup/commands are exercised above and are not a contiguous reply suffix.
  const capture = captures.find(entry => entry.r === r)!; capture.starts.length = 0; capture.replies.length = 0; capture.history.length = 0;
  r.accept();
  expect(alive(r, target.instanceId)).toBe(true); expect(r.state.prohibitions).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]);
  expect(r.state.eventLog.filter(event => event.type === "BATTLE_RESOLVED")).toHaveLength(1); expect(r.state.schemaVersion).toBe(9);
});
for (const cardId of ["OP15-094", "OP08-045", "ST30-009"]) it(`OPT-1001 authored ${cardId} self-trash substitute never reapplies or KOs`, async () => {
  const r = setup(); const source = r.put(cardId, 0, "CHARACTER", { data: { power: 9000 } });
  const target = cardId === "OP08-045" ? source : r.put("OPT1001-SACRIFICE-TARGET", 0, "CHARACTER", { data: { power: cardId === "ST30-009" ? 6000 : 5000, types: ["Straw Hat Crew"] } });
  event(r, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }); r.select([target.instanceId]);
  if (r.promptType() === "OPTIONAL_EFFECT") { await r.reload(); r.accept(); }
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]); expect(alive(r, source.instanceId)).toBe(false);
  if (source !== target) expect(alive(r, target.instanceId)).toBe(true);
  expect(r.state.eventLog.filter(event => event.type === "CARD_KO")).toHaveLength(0);
  expect(r.state.players[0].hand).toHaveLength(cardId === "OP15-094" ? 0 : 1);
});
for (const accept of [false, true]) it(`OPT-885 field-trash action count excludes protected cards and substitute movement accept=${accept}`, async () => {
  const r = setup(); const { targets, payment } = prepare(r);
  r.put("OPT1001-COUNT-NONNAVY", 0, "CHARACTER", { data: { power: 5000 } });
  const source = r.put("OPT1001-COUNT-SOURCE", 1, "CHARACTER", { schema: synSchema("OPT1001-COUNT-SOURCE", [{ id: "count", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [
    { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } }, result_ref: "trashed" },
    { type: "DRAW", params: { amount: { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", ref: "trashed", multiplier: 1 } }, chain: "THEN" },
  ] }]) });
  r.state.turn.activePlayerIndex = 1; r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "count" });
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); if (accept) await pay(r, payment.map(card => card.instanceId)); else r.decline();
  expect(alive(r, targets[0].instanceId)).toBe(accept); expect(r.state.players[1].hand).toHaveLength(accept ? 1 : 2);
  expect(r.state.eventLog.filter(event => event.type === "CARD_KO")).toHaveLength(0); expect(r.state.effectStack).toEqual([]);
});
it("OPT-1001 authored Brook choice reaches field-trash replacement", async () => {
  const r = setup(); const { targets, payment } = prepare(r); r.db.get(targets[0].cardId)!.cost = 4;
  const source = r.put("OP06-092", 1, "HAND", { data: { cost: 0 } }); r.state.turn.activePlayerIndex = 1;
  r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, 1); const prompt = r.state.pendingPrompt!.options;
  if (prompt.promptType !== "PLAYER_CHOICE") throw new Error("Brook choice");
  r.act({ type: "PLAYER_CHOICE", choiceId: prompt.choices[0].id }); r.select([targets[0].instanceId]);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); await pay(r, payment.map(card => card.instanceId)); expect(alive(r, targets[0].instanceId)).toBe(true);
});
it("OPT-1001 Koby7k-base ceiling excludes an8k-base Navy despite printed remover legality", () => {
  const r = setup(); const { targets } = prepare(r); r.db.get(targets[0].cardId)!.power = 8000;
  event(r, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } });
  expect(r.state.pendingPrompt).toBeNull(); expect(alive(r, targets[0].instanceId)).toBe(false);
});
it("OPT-1001 native9 field-trash feasibility stays lazy with128 trash cards", () => {
  const r = setup(); prepare(r, true, 128);
  const started = performance.now();
  event(r, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } });
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); expect(performance.now() - started).toBeLessThan(1000);
});
it("OPT-1001 field-trash rescans after Koby decline and offers authored Zoro", async () => {
  const r = setup(); const { targets } = prepare(r); r.db.get(targets[0].cardId)!.types = ["Navy", "Straw Hat Crew"];
  const zoro = r.put("OP15-094", 0, "CHARACTER", { data: { power: 9000 } });
  beckman(r, [targets[0].instanceId]); expect(r.promptType()).toBe("PLAYER_CHOICE");
  const koby = r.state.activeEffects.find(effect => effect.sourceCardInstanceId === r.state.players[0].leader.instanceId && effect.modifiers.some(modifier => modifier.type === "REPLACEMENT_EFFECT"))!;
  r.act({ type: "PLAYER_CHOICE", choiceId: koby.id }); r.decline(); expect(r.promptType()).toBe("OPTIONAL_EFFECT"); await r.reload(); r.accept();
  expect(alive(r, targets[0].instanceId)).toBe(true); expect(alive(r, zoro.instanceId)).toBe(false); expect(r.state.players[0].trash).toHaveLength(4);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]); expect(r.state.eventLog.filter(event => event.type === "CARD_KO")).toHaveLength(0);
});
it("OPT-1006 synthetic REST_DON then KO cost first promotes inside authored Thatch substitute, retaining OPT-958 policy", async () => {
  const r = setup(); r.state.turn.activePlayerIndex = 0;
  const thatch = r.put("OP08-045", 0, "CHARACTER");
  const source = r.put("OPT1006-GRAFTED-COST", 0, "CHARACTER", { schema: synSchema("OPT1006-GRAFTED-COST", [{
    id: "grafted", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { once_per_turn: true },
    costs: [{ type: "REST_DON", amount: 1 }, { type: "KO_OWN_CHARACTER", amount: 1 }],
    actions: [{ type: "DRAW", params: { amount: 4 } }],
  }]) });
  r.state.players[0].donCostArea = [{ instanceId: "grafted-don", state: "ACTIVE", attachedTo: null }];
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "grafted" }, 0);
  if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
  expect(r.state.schemaVersion).toBe(8); expect(r.promptType()).toBe("SELECT_TARGET");
  expect(r.state.effectStack.some(frame => frame.phase === "AWAITING_COST_SELECTION")).toBe(true);
  await r.reload();
  expect(r.state.effectStack.some(frame => frameKindOf(frame) === "COST")).toBe(true);
  r.select([thatch.instanceId]); if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
  // Thatch's mandatory KO substitute trashes itself then draws one. The grafted
  // post-cost DRAW4 is skipped. Known OPT-958/Decision10 compatibility policy:
  // earlier DON is restored and use unconsumed; rule8-3-1-3-1 retains paid DON,
  // while applying10-2-13-5 use consumption to replaced cost is assumed reading.
  expect(r.state.schemaVersion).toBe(9); expect(r.state.costSemanticsVersion).toBe(8);
  expect(r.state.players[0].donCostArea[0].state).toBe("ACTIVE");
  expect(r.state.turn.oncePerTurnUsed.grafted?.includes(source.instanceId) ?? false).toBe(false);
  expect(r.state.players[0].hand).toHaveLength(1); expect(alive(r, thatch.instanceId)).toBe(false);
  expect(r.state.eventLog.filter(event => event.type === "CARD_KO")).toEqual([]);
  expect(r.state.effectStack).toEqual([]); expect(r.state.pendingPrompt).toBeNull();
  await r.reload(); expect(r.state.schemaVersion).toBe(9); expect(alive(r, thatch.instanceId)).toBe(false);
});
afterEach(async () => {
  const folder = process.env.OPT1001_WRITE_CORPUS;
  for (const capture of captures.splice(0)) {
    if (!folder || !capture.starts.some(state => state.schemaVersion === 9)) continue;
    const cases: { stored: Record<string, unknown>; replies: GameAction[] }[] = [];
    const canonicalReplies: GameAction[] = [];
    let authoritative = structuredClone(capture.starts[0]);
    for (const [index, reply] of capture.replies.entries()) {
      const storage = new MemorySessionStorage(); const repo = new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" });
      await repo.save({ state: authoritative, cardDb: capture.r.db, undoHistory: capture.history[index], mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
      const loaded = (await repo.load())!;
      cases.push({ stored: Object.fromEntries(storage.data), replies: [] });
      const canonicalReply = { ...reply, promptId: loaded.state.pendingPrompt!.promptId } as GameAction;
      canonicalReplies.push(canonicalReply);
      const routed = new SessionCoordinator().executeAction(loaded.state, loaded.undoHistory, loaded.state.pendingPrompt!.respondingPlayer, canonicalReply, loaded.cardDb);
      expect(routed.kind).toBe("resume");
      const resumed = resumePromptLifecycle(routed.state, canonicalReply, loaded.cardDb, { drainPregame: state => state, advanceStartOfTurn: state => state });
      expect(resumed.responseRejected).toBe(false); authoritative = resumed.state;
    }
    // Canonical save/load assigns IDs even at replies where the compact rig
    // did not reload. Check independent gameplay against that rig, then retain
    // the complete canonical output for exact cross-build replay.
    for (const owner of [0, 1] as const) for (const zone of ["deck", "hand", "trash", "characters"] as const) {
      expect(authoritative.players[owner][zone].map(card => card?.cardId)).toEqual(capture.r.state.players[owner][zone].map(card => card?.cardId));
    }
    expect(authoritative.eventLog.map(event => event.type)).toEqual(capture.r.state.eventLog.map(event => event.type));
    expect(authoritative.schemaVersion).toBe(9); expect(authoritative.pendingPrompt).toBeNull(); expect(authoritative.effectStack).toEqual([]);
    cases.forEach((entry, index) => { entry.replies = canonicalReplies.slice(index); });
    mkdirSync(folder, { recursive: true }); const name = expect.getState().currentTestName!.replace(/[^a-zA-Z0-9]+/g, "-");
    writeFileSync(`${folder}/${name}.json`, JSON.stringify({ producer: process.env.OPT1001_PRODUCER_SHA, cases, expected: toPersistedGameState(authoritative) }, null, 2) + "\n");
  }
});
