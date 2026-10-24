import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { afterEach, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { GameAction, GameState } from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const captures: { r: Rig; initial: GameState; starts: GameState[]; replies: GameAction[]; history: GameState[][] }[] = [];
function setup(mode: 6 | 7 | 8 = 8) {
  const r = rig(); r.deck(0, 10); r.deck(1, 10); r.leader(0, "OP11-001");
  r.state = { ...r.state, schemaVersion: process.env.OPT1001_WRITE_CORPUS ? 8 : 9, costSemanticsVersion: mode };
  const capture = { r, initial: structuredClone(r.state), starts: [] as GameState[], replies: [] as GameAction[], history: [] as GameState[][] }; captures.push(capture);
  const coordinator = new SessionCoordinator(); let undo: GameState[] = [];
  r.act = (action, player) => {
    const prompt = r.state.pendingPrompt;
    const reply = prompt ? { ...action, promptId: prompt.promptId } as GameAction : action;
    if (prompt) { capture.starts.push(structuredClone(r.state)); capture.replies.push(structuredClone(reply)); capture.history.push(structuredClone(undo)); }
    const routed = coordinator.executeAction(r.state, undo, player ?? prompt?.respondingPlayer ?? r.state.turn.activePlayerIndex, reply, r.db);
    expect(routed.kind, "reason" in routed ? routed.reason : "").not.toBe("reject");
    undo = routed.undoHistory;
    if (routed.kind === "resume") {
      const resumed = resumePromptLifecycle(routed.state, reply, r.db, { drainPregame: state => state, advanceStartOfTurn: state => state });
      expect(resumed.responseRejected).toBe(false); r.state = resumed.state;
    } else r.state = routed.state;
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
it("OPT-1001 reader ordinary8 production path remains byte-compatible until writer activation", () => {
  if (process.env.OPT1001_WRITE_CORPUS) return;
  const r = setup(); r.state = { ...r.state, schemaVersion: 8 }; const { targets } = prepare(r);
  beckman(r, [targets[0].instanceId]); expect(r.state.pendingPrompt).toBeNull(); expect(r.state.schemaVersion).toBe(8);
});
afterEach(async () => {
  const folder = process.env.OPT1001_WRITE_CORPUS;
  for (const capture of captures.splice(0)) {
    if (!folder || !capture.starts.some(state => state.schemaVersion === 9)) continue;
    const cases = [];
    for (const [index, state] of capture.starts.entries()) {
      const storage = new MemorySessionStorage(); const repo = new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" });
      await repo.save({ state, cardDb: capture.r.db, undoHistory: capture.history[index], mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
      cases.push({ stored: Object.fromEntries(storage.data), replies: capture.replies.slice(index) });
    }
    mkdirSync(folder, { recursive: true }); const name = expect.getState().currentTestName!.replace(/[^a-zA-Z0-9]+/g, "-");
    writeFileSync(`${folder}/${name}.json`, JSON.stringify({ producer: process.env.OPT1001_PRODUCER_SHA, cases, expected: toPersistedGameState(capture.r.state) }, null, 2) + "\n");
  }
});
