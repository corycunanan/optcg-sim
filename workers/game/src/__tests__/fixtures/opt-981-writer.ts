/** Synthetic boards; all authored obligations and v11 envelopes are produced by
 * public actions through the coordinator/pipeline, never direct resolver calls
 * or schema11 retagging. Not captured production sessions. */
import type { CardData, GameAction, GameState } from "../../types.js";
import { endPhaseRig } from "../opt-962-rig.js";
import { SessionCoordinator } from "../../session/coordinator.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
import { SessionRepository } from "../../session/persistence.js";
import { MemorySessionStorage } from "./opt-940-synthetic-states.js";

export function fieldDon(state: GameState, owner: 0 | 1) {
  const p = state.players[owner];
  return p.donCostArea.length + p.leader.attachedDon.length + p.characters.reduce((n, c) => n + (c?.attachedDon.length ?? 0), 0);
}
export async function saved(state: GameState, db: Map<string, CardData>, history: GameState[] = []) {
  const storage = new MemorySessionStorage();
  const repo = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "synthetic" });
  await repo.save({ state, cardDb: db, undoHistory: history, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
  const loaded = (await repo.load())!;
  return { state: loaded.state, history: loaded.undoHistory, storage: Object.fromEntries(storage.data) };
}
export function command(state: GameState, db: Map<string, CardData>, history: GameState[], owner: 0 | 1, raw: GameAction) {
  const coordinator = new SessionCoordinator();
  const action = state.pendingPrompt ? { ...raw, promptId: state.pendingPrompt.promptId } : raw;
  const result = coordinator.executeAction(state, history, owner, action, db);
  if (result.kind === "reject") throw Error(result.reason);
  if (result.kind === "resume") {
    const resumed = resumePromptLifecycle(result.state, action, db, {
      drainPregame: s => s, advanceStartOfTurn: s => coordinator.advanceStartOfTurn(s, db),
    });
    if (resumed.responseRejected) throw Error("Rejected resume");
    return { state: resumed.state, history: result.undoHistory, action };
  }
  return { state: result.state, history: result.undoHistory, action };
}
export async function authoredPair(owner: 0 | 1) {
  const r = endPhaseRig();
  r.state.turn.activePlayerIndex = owner;
  const maria = r.put("OP08-074", owner, "CHARACTER", { color: ["Purple"], cost: 3 });
  const ray = r.put("OP13-066", owner, "HAND", { color: ["Purple"], cost: 8 });
  r.db.get(r.state.players[owner].leader.cardId)!.color = ["Purple"];
  const dons = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ instanceId: `${tag}-${i}`, state: "ACTIVE" as const, attachedTo: null }));
  r.state.players[owner].donCostArea = dons(8, "own");
  r.state.players[owner].donDeck = dons(1, "deck");
  r.state.players[owner === 0 ? 1 : 0].donCostArea = dons(5, "other");
  const leader = r.state.players[owner].leader;
  leader.attachedDon = [{ instanceId: "given", state: "ACTIVE", attachedTo: leader.instanceId }];
  let history: GameState[] = [];
  const setupTrace = [];
  for (const action of [
    { type: "ACTIVATE_EFFECT", cardInstanceId: maria.instanceId, effectId: "activate_add_don" },
    { type: "PLAYER_CHOICE", choiceId: "choose-value:1" },
    { type: "PLAY_CARD", cardInstanceId: ray.instanceId },
    { type: "SELECT_TARGET", selectedInstanceIds: [] },
  ] as GameAction[]) {
    const before = await saved(r.state, r.db, history);
    const result = command(before.state, r.db, before.history, owner, action);
    const persisted = await saved(result.state, r.db, result.history);
    setupTrace.push({ owner, action: result.action, before: before.storage, after: persisted.storage });
    r.state = persisted.state; history = persisted.history;
  }
  return { r, history, setupTrace };
}
